const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionsBitField } = require('discord.js');
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('Bot VNS Market + AI este online!'));
app.listen(process.env.PORT || 3000, () => console.log('Web server pornit pe portul 3000'));

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

const userStates = new Map();

client.on('ready', () => {
    console.log(`Logat cu succes ca ${client.user.tag}`);
});

// ==========================================
// INTEGRARE AI PENTRU TICKETE
// ==========================================
client.on('messageCreate', async message => {
    // Dacă e comanda de setup
    if (message.content === '!setuptickets' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        const embed = new EmbedBuilder()
            .setTitle('* **VNS Market Tickets**')
            .setDescription('🌙 **Staff offline** — We will respond as soon as possible.\n\nSelect a category below to open a ticket.')
            .setColor('#2b2d31');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_nitro').setLabel('Nitr0').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_deco').setLabel('Dec0').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_boost').setLabel('Server B00st').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_other').setLabel('Other').setStyle(ButtonStyle.Secondary)
        );

        await message.channel.send({ embeds: [embed], components: [row] });
        return message.delete();
    }

    // Sistemul AI care răspunde DOAR în tickete la mesaje
    if (!message.author.bot && message.channel.type === ChannelType.GuildText && message.channel.name.startsWith('ticket-')) {
        // Ignorăm mesajele care încep cu "!" (comenzi de staff)
        if (message.content.startsWith('!')) return;

        try {
            await message.channel.sendTyping();
            
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                },
                // ... (păstrează tot codul de setup de sus până la secțiunea client.on('messageCreate')) ...

// Sistemul AI care detectează limba și răspunde automat
client.on('messageCreate', async message => {
    if (message.content === '!setuptickets' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        // ... (păstrează codul de setup existent) ...
        return message.delete();
    }

    if (!message.author.bot && message.channel.type === ChannelType.GuildText && message.channel.name.startsWith('ticket-')) {
        if (message.content.startsWith('!')) return;

        try {
            await message.channel.sendTyping();
            
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [
                        { 
                            role: 'system', 
                            content: `Ești asistentul AI al magazinului VNS Market. 
                            REGULĂ DE AUR: Răspunde ÎNTOTDEAUNA în aceeași limbă în care a scris clientul (dacă scrie în română, răspunzi în română; dacă scrie în engleză, răspunzi în engleză). 
                            Ești politicos și concis. Răspunzi la întrebări despre produse (Nitro, Deco, Boost). 
                            Dacă este întrebat de prețuri sau detalii de plată, informează clientul că un membru Staff va veni imediat pentru a discuta detaliile financiare în ticket.` 
                        },
                        { role: 'user', content: message.content }
                    ]
                })
            });

            const data = await response.json();
            if (data.choices && data.choices.length > 0) {
                await message.reply(data.choices[0].message.content);
            }
        } catch (err) {
            console.error('Eroare AI:', err);
        }
    }
});

// ... (păstrează restul codului de butoane, numpad și interacțiuni de mai sus) ...
            

            const data = await response.json();
            if (data.choices && data.choices.length > 0) {
                await message.reply(data.choices[0].message.content);
            }
        } catch (err) {
            console.error('Eroare AI:', err);
        }
    }
});

// ==========================================
// FUNCTIE PENTRU TASTATURA (CÂNTAR)
// ==========================================
function getNumpad() {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('numpad_1').setLabel('1').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('numpad_2').setLabel('2').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('numpad_3').setLabel('3').setStyle(ButtonStyle.Secondary)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('numpad_4').setLabel('4').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('numpad_5').setLabel('5').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('numpad_6').setLabel('6').setStyle(ButtonStyle.Secondary)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('numpad_7').setLabel('7').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('numpad_8').setLabel('8').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('numpad_9').setLabel('9').setStyle(ButtonStyle.Secondary)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('numpad_clear').setLabel('Șterge').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('numpad_0').setLabel('0').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('numpad_done').setLabel('✅ Gata').setStyle(ButtonStyle.Success)
        )
    ];
}

client.on('interactionCreate', async interaction => {
    if (!userStates.has(interaction.user.id)) {
        userStates.set(interaction.user.id, { tempQty: '' });
    }
    const state = userStates.get(interaction.user.id);

    if (interaction.isButton()) {
        // ==========================================
        // BUTOANELE TASTATURII NUMERICE
        // ==========================================
        if (interaction.customId.startsWith('numpad_')) {
            const value = interaction.customId.split('_')[1];

            if (value === 'clear') {
                state.tempQty = '';
            } else if (value === 'done') {
                if (!state.tempQty || state.tempQty === '0') state.tempQty = '1';
                state.quantity = state.tempQty + 'x';
                
                // Redirecționare în funcție de produs după ce s-a ales cantitatea
                if (state.product.includes('Nitr0')) {
                    return trimiteMetodaPlata(interaction, 'Alege metoda de plată pentru Nitro:', true);
                } else if (state.product === 'Server B00st') {
                    return arataConfirmarea(interaction, state, true);
                }
            } else {
                if (state.tempQty.length < 4) state.tempQty += value; // Limită de 4 cifre
            }

            return interaction.update({ 
                content: `**Cantitate curentă introdusă:** ${state.tempQty || '0'}\n\nFolosește tastatura pentru a forma numărul de bucăți, apoi apasă ✅ Gata.`, 
                components: getNumpad() 
            });
        }

        // ==========================================
        // BUTOANELE MENIULUI PRINCIPAL
        // ==========================================
        if (interaction.customId === 'btn_nitro') {
            state.product = 'Nitr0';
            state.tempQty = ''; // Resetăm tastatura
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('sel_nitro_type')
                    .setPlaceholder('Alege tipul de Nitro')
                    .addOptions([
                        { label: 'Nitro Boost', value: 'Nitro Boost' },
                        { label: 'Nitro Basic', value: 'Nitro Basic' }
                    ])
            );
            return interaction.reply({ content: 'Alege tipul de Nitro:', components: [row], ephemeral: true });
        }

        if (interaction.customId === 'btn_deco') {
            state.product = 'Dec0';
            state.quantity = '1x'; // La deco ai cerut să meargă direct la plată
            return trimiteMetodaPlata(interaction, 'Alege metoda de plată pentru Dec0:');
        }

        if (interaction.customId === 'btn_boost') {
            state.product = 'Server B00st';
            state.tempQty = ''; // Resetăm tastatura
            return trimiteMetodaPlata(interaction, 'Alege metoda de plată pentru Server Boost:');
        }

        if (interaction.customId === 'btn_other') {
            state.product = 'Other';
            const modal = new ModalBuilder().setCustomId('modal_other').setTitle('Detalii Comandă Other');
            const itemInput = new TextInputBuilder().setCustomId('other_item').setLabel('Ce vrei sa cumperi?').setStyle(TextInputStyle.Short).setRequired(true);
            const budgetInput = new TextInputBuilder().setCustomId('other_budget').setLabel('Cât buget ai?').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(itemInput), new ActionRowBuilder().addComponents(budgetInput));
            return interaction.showModal(modal);
        }

        // ==========================================
        // CREARE TICKET
        // ==========================================
        if (interaction.customId === 'btn_open_ticket') {
            await interaction.deferReply({ ephemeral: true });
            
            let pingId = '';
            if (state.product.includes('Nitr0')) pingId = '1534479829225832528';
            else if (state.product === 'Dec0') pingId = '1534480089083936789';
            else if (state.product === 'Server B00st') pingId = '1534480275474612254';
            else if (state.product === 'Other') pingId = '1535562946107809883';

            const channel = await interaction.guild.channels.create({
                name: `ticket-${interaction.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                    { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
                ]
            });

            const ticketEmbed = new EmbedBuilder()
                .setTitle(`🦋 | ${state.product}`)
                .setDescription(`<@${interaction.user.id}> • Ticket Created\n\n**Method:** ${state.payment}\n**Quantity:** ${state.quantity || '1x'}\n**Product:** ${state.subProduct || state.product}\n**Amount:** Discută în ticket${state.duration ? `\n**Durată:** ${state.duration}` : ''}${state.budget ? `\n**Buget:** ${state.budget}` : ''}`)
                .setColor('#2ecc71');

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('t_claim').setLabel('🔔 Claim').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('t_transcript').setLabel('📋 Transcript').setStyle(ButtonStyle.Secondary)
            );
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('t_adduser').setLabel('👤 Add User').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('t_remuser').setLabel('🚫 Remove User').setStyle(ButtonStyle.Danger)
            );
            const row3 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('t_qty').setLabel('🛒 Change Quantity').setStyle(ButtonStyle.Secondary)
            );
            const row4 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('t_mm').setLabel('🛡️ MM').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('t_ping').setLabel('🔔 Ping Staff').setStyle(ButtonStyle.Secondary)
            );
            const row5 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('t_close').setLabel('🔒 Close').setStyle(ButtonStyle.Danger)
            );

            await channel.send({ content: `<@${interaction.user.id}> <@&${pingId}>\n*Asistentul AI este activ în acest ticket și te poate ajuta până vine staff-ul.*`, embeds: [ticketEmbed], components: [row1, row2, row3, row4, row5] });
            
            userStates.delete(interaction.user.id);
            return interaction.editReply({ content: `Ticket deschis cu succes: <#${channel.id}>` });
        }

        if (interaction.customId === 'btn_cancel_ticket') {
            userStates.delete(interaction.user.id);
            return interaction.update({ content: 'Proces anulat.', embeds: [], components: [] });
        }

        // Interior ticket
        if (interaction.customId === 't_close') {
            await interaction.reply('Ticket-ul se va închide în 5 secunde...');
            setTimeout(() => interaction.channel.delete(), 5000);
        }
        if (['t_claim', 't_transcript', 't_adduser', 't_remuser', 't_qty', 't_mm', 't_ping'].includes(interaction.customId)) {
            if (interaction.customId === 't_ping') {
                return interaction.reply({ content: '<@&1534625944017571941> Staff-ul a fost notificat!', ephemeral: false });
            }
            return interaction.reply({ content: 'Funcție în dezvoltare.', ephemeral: true });
        }
    }

    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'sel_nitro_type') {
            state.subProduct = interaction.values[0];
            // AFIȘĂM TASTATURA CÂNTAR
            return interaction.update({ content: `**Cantitate curentă introdusă:** 0\n\nFolosește tastatura pentru a forma numărul de bucăți, apoi apasă ✅ Gata.`, components: getNumpad() });
        }

        if (interaction.customId === 'sel_pay_method') {
            state.payment = interaction.values[0];
            
            if (state.product === 'Server B00st' && !state.duration) {
                const row = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId('sel_boost_duration').setPlaceholder('Alege durata').addOptions([
                        { label: '1 Lună', value: '1 Luna' }, { label: '3 Luni', value: '3 Luni' }
                    ])
                );
                return interaction.update({ content: 'Alege durata boost-ului:', components: [row] });
            }

            return arataConfirmarea(interaction, state, true);
        }

        if (interaction.customId === 'sel_boost_duration') {
            state.duration = interaction.values[0];
            // AFIȘĂM TASTATURA CÂNTAR PENTRU BOOST
            return interaction.update({ content: `**Cantitate curentă introdusă:** 0\n\nCâte boost-uri dorești? (ex: 14, 28, etc.). Folosește tastatura și apasă ✅ Gata.`, components: getNumpad() });
        }
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'modal_other') {
            state.subProduct = interaction.fields.getTextInputValue('other_item');
            state.budget = interaction.fields.getTextInputValue('other_budget');
            return trimiteMetodaPlata(interaction, 'Alege metoda de plată pentru Other:');
        }
    }
});

function trimiteMetodaPlata(interaction, mesaj, isUpdate = false) {
    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('sel_pay_method').setPlaceholder('Metoda de plată').addOptions([
            { label: 'Transfer Bancar', value: 'Transfer Bancar' },
            { label: 'PayPal', value: 'PayPal' },
            { label: 'Crypto', value: 'Crypto' }
        ])
    );
    if (isUpdate) return interaction.update({ content: mesaj, components: [row] });
    return interaction.reply({ content: mesaj, components: [row], ephemeral: true });
}

function arataConfirmarea(interaction, state, isUpdate = false) {
    const embed = new EmbedBuilder()
        .setTitle('Verificare Detalii')
        .setDescription(`Verifică dacă datele sunt corecte înainte de a deschide ticket-ul.\n\n**Produs:** ${state.product} ${state.subProduct ? `(${state.subProduct})` : ''}\n**Cantitate:** ${state.quantity || 'N/A'}\n**Plată:** ${state.payment}\n**Preț:** Discută în ticket`)
        .setColor('#e67e22');
    
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_open_ticket').setLabel('✅ Deschide Ticket').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('btn_cancel_ticket').setLabel('❌ Anulează').setStyle(ButtonStyle.Danger)
    );

    if (isUpdate) return interaction.update({ content: '', embeds: [embed], components: [row] });
    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

client.login(process.env.DISCORD_TOKEN);
                        
