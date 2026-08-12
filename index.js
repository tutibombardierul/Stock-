const http = require('http');

// Creează un server web simplu care răspunde pe portul cerut de Render
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running!');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serverul HTTP ascultă pe portul ${PORT}`);
});

const { Client, GatewayIntentBits } = require('discord.js');
const OpenAI = require('openai');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `
Ești asistentul virtual oficial al magazinului VNS Market. 
Magazinul tău se ocupă cu vânzarea de servicii și conturi (Netflix, Nitro, Disney, YouTube etc.).
Modul tău de lucru:
1. Ești extrem de amabil, prietenos și vorbești doar în limba română.
2. Când un client deschide un tichet, îl întâmpini călduros și îl întrebi cu ce produs sau serviciu îl poți ajuta.
3. Răspunzi la întrebări legate de prețuri aproximative, garanție sau detalii despre produse.
4. Deoarece fondatorul cumpără produsele pe loc de la furnizor, dacă un client vrea să cumpere ceva, îi explici politicos: "Am înregistrat cererea! Verific stocul și revin în scurt timp cu detaliile și datele de plată."
5. Nu inventa reguli de plată ciudate; îndrumă-i spre metodele standard (Revolut/Crypto/paypal/bank) dacă întreabă.
`;

client.once('ready', () => {
    console.log(`Botul este online și gata de treabă ca ${client.user.tag}!`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.channel.name.startsWith('ticket-')) return;

    try {
        await message.channel.sendTyping();

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: message.content }
            ],
            temperature: 0.7,
        });

        const reply = response.choices[0].message.content;
        await message.channel.send(reply);

    } catch (error) {
        console.error('Eroare la generarea răspunsului AI:', error);
        await message.channel.send('Întâmpin o mică problemă tehnică momentan. Te rog să ai puțină răbdare, revine fondatorul imediat!');
    }
});

client.login(process.env.DISCORD_TOKEN);
