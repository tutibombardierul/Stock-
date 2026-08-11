
const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require('discord.js');
const express = require('express');

// Server web minimal pentru a menține botul treaz 24/7 pe Render
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Botul de Discord este activ și rulează!');
});

app.listen(PORT, () => {
    console.log(`Serverul web rulează pe portul ${PORT}`);
});

// Configurare Bot Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages
    ]
});

const LOG_CHANNEL_ID = '1535997796493041694';

// Înregistrarea comenzii slash /bon
const commands = [
    new SlashCommandBuilder()
        .setName('bon')
        .setDescription('Emite un bon fiscal și cere confirmarea clientului')
        .addUserOption(option => 
            option.setName('client')
                .setDescription('Clientul care a achiziționat produsul')
                .setRequired(true))
        .addUserOption(option => 
            option.setName('casier')
                .setDescription('Casierul/Staff-ul care a procesat comanda')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('produse')
                .setDescription('Produsele / Serviciile cumpărate (ex: 1x Configurare 150 RON)')
                .setRequired(true))
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`Botul este online ca ${client.user.tag}!`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('Se înregistrează comenzile Slash...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('Comenzile au fost înregistrate cu succes!');
    } catch (error) {
        console.error('Eroare la înregistrarea comenzilor:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'bon') {
            const clientUser = interaction.options.getUser('client');
            const casierUser = interaction.options.getUser('casier');
            const produse = interaction.options.getString('produse');

            const transactionId = `TRX-${Math.floor(100000 + Math.random() * 900000)}`;

            const confirmEmbed = new EmbedBuilder()
                .setColor('#00ffcc')
                .setTitle('🎫 Confirmare Primire Produse / Servicii')
                .setDescription('Salut! Ai o comandă nouă înregistrată. Te rugăm să confirmi primirea apăsând pe butonul de mai jos.')
                .addFields(
                    { name: '👤 Casier', value: `<@${casierUser.id}>`, inline: true },
                    { name: '📦 Produse', value: produse, inline: false },
                    { name: '🆔 ID Tranzacție', value: `\`${transactionId}\``, inline: true }
                )
                .setTimestamp();

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`confirm_bon_${transactionId}`)
                        .setLabel('Am primit produsele')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('✅')
                );

            try {
                await clientUser.send({ embeds: [confirmEmbed], components: [row] });
                
                await interaction.reply({ 
                    content: `Succes! S-a trimis cererea de confirmare în DM-ul lui <@${clientUser.id}>. (ID: \`${transactionId}\`)`, 
                    ephemeral: true 
                });

                if (!client.pendingBons) client.pendingBons = new Map();
                client.pendingBons.set(transactionId, {
                    clientTag: clientUser.tag,
                    clientId: clientUser.id,
                    casierTag: casierUser.tag,
                    produse: produse,
                    date: new Date().toLocaleString()
                });

            } catch (error) {
                console.error(error);
                await interaction.reply({ 
                    content: 'Eroare: Nu am putut trimite mesajul în DM-ul clientului (are mesajele private închise).', 
                    ephemeral: true 
                });
            }
        }
    }

    if (interaction.isButton()) {
        if (interaction.customId.startsWith('confirm_bon_')) {
            const transactionId = interaction.customId.replace('confirm_bon_', '');
            const txData = client.pendingBons?.get(transactionId);

            if (!txData) {
                return interaction.reply({ content: 'Această tranzacție a expirat sau a fost deja procesată.', ephemeral: true });
            }

            const bonFiscal = `
===================================
       SC ELITE SERVICES SRL       
      Bucuresti, Zona Oficiala     
===================================
BON FISCAL                 NR: ${transactionId}
Data: ${txData.date}
Casier: ${txData.casierTag}
Client: ${txData.clientTag}
-----------------------------------+
PRODUSE / SERVICII                 
-----------------------------------+
${txData.produse}
-----------------------------------+
STATUS: ACHITAT & LIVRAT (CONFIRMAT)
===================================
     Multumim pentru colaborare!     
===================================`;

            await interaction.update({
                content: '✅ **Mulțumiri! Ai confirmat primirea.** Iată bonul tău fiscal:',
                embeds: [],
                components: []
            });
            await interaction.followUp({ content: `\`\`\`text\n${bonFiscal}\n\`\`\``, ephemeral: true });

            try {
                const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor('#00ffcc')
                        .setTitle(`🧾 Nou Bon Confirmat - ${transactionId}`)
                        .setDescription(`\`\`\`text\n${bonFiscal}\n\`\`\``)
                        .addFields(
                            { name: 'Client', value: `<@${txData.clientId}>`, inline: true },
                            { name: 'Status', value: '🟢 Confirmat de client', inline: true }
                        )
                        .setTimestamp();

                    await logChannel.send({ embeds: [logEmbed] });
                }
            } catch (err) {
                console.error('Nu s-a putut trimite logul în canal:', err);
            }

            client.pendingBons.delete(transactionId);
        }
    }
});

// Autentificare folosind variabila de mediu din Render
client.login(process.env.DISCORD_TOKEN);
