// ==============================================================================
// 1. MODULES & SERVER KEEP-ALIVE
// ==============================================================================
const { 
    Client, 
    GatewayIntentBits, 
    Partials,
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    EmbedBuilder, 
    PermissionsBitField, 
    PermissionFlagsBits,
    ChannelType,
    AttachmentBuilder,
    REST,
    Routes,
    SlashCommandBuilder
} = require('discord.js');
const express = require('express');
require('dotenv').config();

const app = express();
app.get('/', (req, res) => res.send('⚡ VNS Market Bot is online and ready!'));
app.listen(process.env.PORT || 3000);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel, Partials.Message]
});

// ==============================================================================
// 2. CONFIGURATIONS & EMOJIS
// ==============================================================================
const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN,
    CLIENT_ID: process.env.CLIENT_ID,
    GUILD_ID: process.env.GUILD_ID,

    COLOR_PRIMARY: '#2B2D31',
    COLOR_TICKET: '#5865F2',
    
    // UPDATED OWNER ID
    OWNER_ID: '1526468347162788096',
    STAFF_ROLE_ID: '1534625944017571941',
    TRANSCRIPT_CHANNEL_ID: '1534479829225832528', 

    BANNER_URL: 'https://cdn.discordapp.com/attachments/1531290394242056344/1537451917893181580/standard_2.gif?ex=6a7f172d&is=6a7dc5ad&hm=e6ecd8fe90fd79822e1f5efe2efcdabdaf32d3f072fc7359f29237eb1217186d&', 
    
    PINGS: {
        NITRO: '1534479829225832528',
        DECO: '1534480089083936789',
        BOOST: '1534480275474612254',
        OTHER: '1535562946107809883'
    },

    AUTO_CLOSE: {
        ENABLED: true,
        CHECK_INTERVAL_MINUTES: 10,
        WARNING_HOURS: 24,
        CLOSE_HOURS: 36
    },

    SECURITY: {
        ANTI_LINK: true,
        ANTI_SPAM: true,
        ANTI_RAID: false
    },

    EMOJIS: {
        NITRO: '🚀', DECO: '🎨', BOOST: '⚡', OTHER: '🎁', CLAIM: '🔔',
        TRANSCRIPT: '📜', ADD_USER: '➕', REMOVE_USER: '➖', CHANGE_QTY: '🔢',
        PING: '📢', CLOSE: '🔒', CHECK: '✅', SPARKLES: '✨', CART: '🛒',
        CARD: '💳', CROSS: '❌', WARNING: '⚠️', STAR: '⭐'
    }
};

// In-Memory Databases
const userSessions = new Map();
const spamTracker = new Map();
const recentJoins = [];

let DB = {
    staffStats: {},    
    ticketBans: [],     
    clientHistory: {},  
    notes: {}           
};

// Helper: Owner / Admin Permission Check
function isOwnerOrAdmin(user, member, guild) {
    if (!user) return false;
    return user.id === CONFIG.OWNER_ID || 
           guild?.ownerId === user.id || 
           member?.permissions?.has(PermissionFlagsBits.Administrator);
}

// Helper: Staff Check
function isStaff(member) {
    if (!member) return false;
    return member.roles.cache.has(CONFIG.STAFF_ROLE_ID) || member.id === CONFIG.OWNER_ID || member.permissions.has(PermissionFlagsBits.Administrator);
}

// Helper: Build Help Embed
function buildHelpEmbed() {
    return new EmbedBuilder()
        .setTitle(`${CONFIG.EMOJIS.SPARKLES} VNS Market - Help & Commands`)
        .setColor(CONFIG.COLOR_PRIMARY)
        .setDescription('Here are the available commands you can use with prefix `!` or `/`:')
        .addFields(
            { name: '🎫 Setup & Admin', value: '`!setup-tickets` / `/setup-tickets` - Deploy the main ticket panel\n`!owner-panel` / `/owner-panel` - Owner emergency panel\n`!purge-inactive` - Auto-close inactive tickets', inline: false },
            { name: '🛠️ Ticket Commands', value: '`!rename <name>` / `/rename` - Rename channel\n`!note <text>` / `/note` - Add internal staff note\n`!transfer <user>` - Transfer ticket\n`!staff-stats` - View staff activity statistics', inline: false },
            { name: '🛡️ Security (Slash Only)', value: '`/antilinks`, `/antispam`, `/antiraid` - Toggle security settings', inline: false }
        )
        .setFooter({ text: 'VNS Market Bot Support' });
}

// ==============================================================================
// 3. SLASH COMMANDS DEFINITION & REGISTRATION
// ==============================================================================
const slashCommands = [
    new SlashCommandBuilder().setName('help').setDescription('Display bot commands and help info'),
    new SlashCommandBuilder().setName('setup-tickets').setDescription('Deploy the official VNS Market Tickets panel (Owner/Admin Only)'),
    new SlashCommandBuilder().setName('rename').setDescription('Rename current ticket channel')
        .addStringOption(opt => opt.setName('name').setDescription('New channel name').setRequired(true)),
    new SlashCommandBuilder().setName('owner-panel').setDescription('Emergency control panel (Owner/Admin Only)'),
    new SlashCommandBuilder().setName('staff-stats').setDescription('View staff team statistics')
        .addUserOption(opt => opt.setName('user').setDescription('Target staff member')),
    new SlashCommandBuilder().setName('note').setDescription('Add an internal note to the ticket (Staff Only)')
        .addStringOption(opt => opt.setName('text').setDescription('Note content').setRequired(true)),
    new SlashCommandBuilder().setName('transfer').setDescription('Transfer ticket to another staff member')
        .addUserOption(opt => opt.setName('staff').setDescription('Select new staff').setRequired(true)),
    new SlashCommandBuilder().setName('client-history').setDescription('View a client ticket history')
        .addUserOption(opt => opt.setName('user').setDescription('Select client').setRequired(true)),
    new SlashCommandBuilder().setName('purge-inactive').setDescription('Close all inactive tickets (Owner/Admin Only)'),
    
    // Security Commands
    new SlashCommandBuilder().setName('antilinks').setDescription('Toggle Anti-Links Protection (Owner Only)')
        .addBooleanOption(opt => opt.setName('status').setDescription('Enabled or Disabled').setRequired(true)),
    new SlashCommandBuilder().setName('antispam').setDescription('Toggle Anti-Spam Protection (Owner Only)')
        .addBooleanOption(opt => opt.setName('status').setDescription('Enabled or Disabled').setRequired(true)),
    new SlashCommandBuilder().setName('antiraid').setDescription('Toggle Anti-Raid Protection (Owner Only)')
        .addBooleanOption(opt => opt.setName('status').setDescription('Enabled or Disabled').setRequired(true))
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
    console.log(`=================================`);
    console.log(`✅ Logged in as: ${client.user.tag}`);
    console.log(`=================================`);

    const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN || process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationGuildCommands(CONFIG.CLIENT_ID, CONFIG.GUILD_ID), { body: slashCommands });
        console.log(`${CONFIG.EMOJIS.SPARKLES} Slash Commands registered successfully!`);
    } catch (error) {
        console.error('❌ Error registering commands:', error);
    }

    if (CONFIG.AUTO_CLOSE.ENABLED) {
        setInterval(checkInactiveTickets, CONFIG.AUTO_CLOSE.CHECK_INTERVAL_MINUTES * 60 * 1000);
        console.log(`⏳ Auto-Close Scanner active!`);
    }
});

// ==============================================================================
// 4. SCANNER FOR INACTIVE CHANNELS
// ==============================================================================
async function checkInactiveTickets(force = false) {
    client.guilds.cache.forEach(async (guild) => {
        const ticketChannels = guild.channels.cache.filter(c => 
            c.type === ChannelType.GuildText && 
            (c.name.startsWith('nitr0-') || c.name.startsWith('dec0-') || c.name.startsWith('serverboost-') || c.name.startsWith('other-'))
        );

        for (const [_, channel] of ticketChannels) {
            try {
                const messages = await channel.messages.fetch({ limit: 1 });
                const lastMsg = messages.first();
                if (!lastMsg && !force) continue;

                const diffMs = Date.now() - (lastMsg ? lastMsg.createdTimestamp : 0);
                const diffHours = diffMs / (1000 * 60 * 60);

                if (diffHours >= CONFIG.AUTO_CLOSE.CLOSE_HOURS || force) {
                    await channel.send(`${CONFIG.EMOJIS.CLOSE} 🔒 **Ticket closed automatically due to inactivity.**`);
                    await generateAndSendTranscript(channel, client.user);
                    setTimeout(() => channel.delete().catch(() => {}), 5000);
                } 
                else if (diffHours >= CONFIG.AUTO_CLOSE.WARNING_HOURS) {
                    if (lastMsg.author.id === client.user.id && lastMsg.content.includes('INACTIVITY_WARNING')) continue;

                    const ownerOverwrite = channel.permissionOverwrites.cache.find(o => o.type === 1);
                    const userPing = ownerOverwrite ? `<@${ownerOverwrite.id}>` : '';

                    const warningEmbed = new EmbedBuilder()
                        .setTitle(`${CONFIG.EMOJIS.WARNING} Inactivity Warning`)
                        .setDescription(`This ticket has not seen activity for the past **${CONFIG.AUTO_CLOSE.WARNING_HOURS} hours**.\n\nIf no response is received, it will automatically close in **${CONFIG.AUTO_CLOSE.CLOSE_HOURS - CONFIG.AUTO_CLOSE.WARNING_HOURS} hours**!`)
                        .setColor('#FFA500');

                    await channel.send({ content: `${userPing} INACTIVITY_WARNING`, embeds: [warningEmbed] });
                }
            } catch (err) {
                console.error(`Inactivity scan error on ${channel.name}:`, err);
            }
        }
    });
}

// ==============================================================================
// 5. NUMPAD UI BUILDER
// ==============================================================================
function buildNumpadUI(currentVal = '') {
    const displayVal = currentVal || '0';
    const embed = new EmbedBuilder()
        .setTitle(`${CONFIG.EMOJIS.CHANGE_QTY} Select Quantity`)
        .setDescription(`Use the keypad below to enter your desired quantity:\n\n\`\`\`\n > [ ${displayVal} ] \n\`\`\``)
        .setColor(CONFIG.COLOR_PRIMARY);

    const r1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('num_1').setLabel('1').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('num_2').setLabel('2').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('num_3').setLabel('3').setStyle(ButtonStyle.Secondary)
    );
    const r2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('num_4').setLabel('4').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('num_5').setLabel('5').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('num_6').setLabel('6').setStyle(ButtonStyle.Secondary)
    );
    const r3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('num_7').setLabel('7').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('num_8').setLabel('8').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('num_9').setLabel('9').setStyle(ButtonStyle.Secondary)
    );
    const r4 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('num_C').setLabel('C').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('num_0').setLabel('0').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('num_back').setLabel('⌫').setStyle(ButtonStyle.Danger)
    );
    const r5 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('num_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary).setEmoji(CONFIG.EMOJIS.CROSS),
        new ButtonBuilder().setCustomId('num_confirm').setLabel('Confirm').setStyle(ButtonStyle.Success).setEmoji(CONFIG.EMOJIS.CHECK)
    );

    return { content: '', embeds: [embed], components: [r1, r2, r3, r4, r5], ephemeral: true };
}

// ==============================================================================
// 6. MAIN PANEL BUILDER
// ==============================================================================
function buildMainPanel() {
    const embed = new EmbedBuilder()
        .setTitle(`${CONFIG.EMOJIS.SPARKLES} **VNS Market Tickets** ${CONFIG.EMOJIS.SPARKLES}`)
        .setDescription('🌙 **Support Center** — Select a category below or use the dropdown to open a ticket.')
        .setColor(CONFIG.COLOR_PRIMARY);

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('ticket_category_select')
        .setPlaceholder('Choose a category from the menu...')
        .addOptions([
            { label: 'Nitr0', value: 'panel_nitro', description: 'Nitr0 Boost / Basic', emoji: CONFIG.EMOJIS.NITRO },
            { label: 'Dec0', value: 'panel_deco', description: 'Profile Decorations & Effects', emoji: CONFIG.EMOJIS.DECO },
            { label: 'Server Boost', value: 'panel_boost', description: 'Boosts for your server', emoji: CONFIG.EMOJIS.BOOST },
            { label: 'Other', value: 'panel_other', description: 'Other services or inquiries', emoji: CONFIG.EMOJIS.OTHER }
        ]);

    const rowSelect = new ActionRowBuilder().addComponents(selectMenu);

    const rowButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('panel_nitro').setLabel('Nitr0').setStyle(ButtonStyle.Primary).setEmoji(CONFIG.EMOJIS.NITRO),
        new ButtonBuilder().setCustomId('panel_deco').setLabel('Dec0').setStyle(ButtonStyle.Primary).setEmoji(CONFIG.EMOJIS.DECO),
        new ButtonBuilder().setCustomId('panel_boost').setLabel('Server Boost').setStyle(ButtonStyle.Primary).setEmoji(CONFIG.EMOJIS.BOOST),
        new ButtonBuilder().setCustomId('panel_other').setLabel('Other').setStyle(ButtonStyle.Secondary).setEmoji(CONFIG.EMOJIS.OTHER)
    );

    return { embeds: [embed], components: [rowSelect, rowButtons] };
}

// ==============================================================================
// 7. TRANSCRIPT GENERATOR
// ==============================================================================
async function generateAndSendTranscript(channel, closedBy) {
    try {
        const messages = await channel.messages.fetch({ limit: 100 });
        let transcriptText = `==================================================\n`;
        transcriptText += `📜 TRANSCRIPT FOR CHANNEL: ${channel.name}\n`;
        transcriptText += `🔒 Closed by: ${closedBy.tag || closedBy.username || 'SYSTEM'} (${closedBy.id})\n`;
        transcriptText += `📅 Date: ${new Date().toISOString()}\n`;
        transcriptText += `==================================================\n\n`;

        messages.reverse().forEach(msg => {
            transcriptText += `[${msg.createdAt.toLocaleString('en-US')}] ${msg.author.tag}: ${msg.content}\n`;
            if (msg.attachments.size > 0) {
                msg.attachments.forEach(att => transcriptText += `   📎 Attachment: ${att.url}\n`);
            }
        });

        const attachment = new AttachmentBuilder(Buffer.from(transcriptText, 'utf-8'), { name: `transcript-${channel.name}.txt` });

        if (CONFIG.TRANSCRIPT_CHANNEL_ID) {
            const logChannel = await channel.guild.channels.fetch(CONFIG.TRANSCRIPT_CHANNEL_ID).catch(() => null);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle(`${CONFIG.EMOJIS.TRANSCRIPT} Ticket Closed - Auto Transcript`)
                    .setColor(CONFIG.COLOR_TICKET)
                    .addFields(
                        { name: 'Channel Name', value: `\`${channel.name}\``, inline: true },
                        { name: 'Closed By', value: `<@${closedBy.id}>`, inline: true },
                        { name: 'Messages Total', value: `\`${messages.size}\``, inline: true }
                    )
                    .setTimestamp();

                await logChannel.send({ embeds: [logEmbed], files: [attachment] });
            }
        }
    } catch (error) {
        console.error('❌ Transcript error:', error);
    }
}

// ==============================================================================
// 8. INTERACTION ENGINE (SLASH COMMANDS & BUTTONS)
// ==============================================================================
client.on('interactionCreate', async (interaction) => {
    // A. SLASH COMMANDS
    if (interaction.isChatInputCommand()) {
        const cmd = interaction.commandName;

        if (cmd === 'help') {
            return interaction.reply({ embeds: [buildHelpEmbed()] });
        }

        if (cmd === 'setup-tickets') {
            if (!isOwnerOrAdmin(interaction.user, interaction.member, interaction.guild)) {
                return interaction.reply({ content: '❌ Access Denied (Owner/Admin Only).', ephemeral: true });
            }
            return interaction.reply(buildMainPanel());
        }

        if (cmd === 'rename') {
            if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ No permission.', ephemeral: true });
            const newName = interaction.options.getString('name');
            await interaction.channel.setName(newName);
            return interaction.reply({ content: `${CONFIG.EMOJIS.CHECK} Channel renamed to: **${newName}**` });
        }

        if (cmd === 'owner-panel') {
            if (!isOwnerOrAdmin(interaction.user, interaction.member, interaction.guild)) {
                return interaction.reply({ content: '❌ Access Denied (Owner/Admin Only).', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('👑 VNS Market - Owner Emergency Panel')
                .setDescription('Select an administrative action for this channel/client:')
                .setColor('#FF0000');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('op_force_close').setLabel('Force Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
                new ButtonBuilder().setCustomId('op_reassign').setLabel('Reassign Staff').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
                new ButtonBuilder().setCustomId('op_ban_ticket').setLabel('Ban from Tickets').setStyle(ButtonStyle.Primary).setEmoji('🚫')
            );

            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }

        if (cmd === 'staff-stats') {
            const target = interaction.options.getUser('user') || interaction.user;
            const stats = DB.staffStats[target.id] || { claimed: 0, closed: 0 };

            const embed = new EmbedBuilder()
                .setTitle(`📊 Staff Statistics - ${target.username}`)
                .addFields(
                    { name: '🎫 Tickets Claimed', value: `\`${stats.claimed}\``, inline: true },
                    { name: '✅ Tickets Closed', value: `\`${stats.closed}\``, inline: true }
                )
                .setColor('#00FF00');

            return interaction.reply({ embeds: [embed] });
        }

        if (cmd === 'note') {
            if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ No permission.', ephemeral: true });
            const text = interaction.options.getString('text');
            if (!DB.notes[interaction.channel.id]) DB.notes[interaction.channel.id] = [];
            DB.notes[interaction.channel.id].push(`[${interaction.user.username}]: ${text}`);
            return interaction.reply({ content: `📝 **Internal note added:** ${text}`, ephemeral: true });
        }

        if (cmd === 'transfer') {
            if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ No permission.', ephemeral: true });
            const newStaff = interaction.options.getUser('staff');
            await interaction.channel.permissionOverwrites.edit(newStaff.id, { ViewChannel: true, SendMessages: true });
            return interaction.reply({ content: `🔄 Ticket transferred to <@${newStaff.id}>!` });
        }

        if (cmd === 'client-history') {
            const target = interaction.options.getUser('user');
            const history = DB.clientHistory[target.id] || { total: 0, closed: 0 };

            const embed = new EmbedBuilder()
                .setTitle(`👤 Client History - ${target.username}`)
                .addFields(
                    { name: '📂 Total Opened Tickets', value: `\`${history.total}\``, inline: true },
                    { name: '🟢 Successfully Closed', value: `\`${history.closed}\``, inline: true }
                )
                .setColor('#3498DB');

            return interaction.reply({ embeds: [embed] });
        }

        if (cmd === 'purge-inactive') {
            if (!isOwnerOrAdmin(interaction.user, interaction.member, interaction.guild)) return interaction.reply({ content: '❌ Access Denied.', ephemeral: true });
            await interaction.reply({ content: '🧹 Purging inactive tickets...' });
            checkInactiveTickets(true);
        }

        if (['antilinks', 'antispam', 'antiraid'].includes(cmd)) {
            if (!isOwnerOrAdmin(interaction.user, interaction.member, interaction.guild)) return interaction.reply({ content: '❌ Only Owner/Admin can modify security settings!', ephemeral: true });
            const status = interaction.options.getBoolean('status');
            if (cmd === 'antilinks') CONFIG.SECURITY.ANTI_LINK = status;
            if (cmd === 'antispam') CONFIG.SECURITY.ANTI_SPAM = status;
            if (cmd === 'antiraid') CONFIG.SECURITY.ANTI_RAID = status;

            return interaction.reply({ content: `🛡️ Security setting **${cmd}** is now **${status ? 'ENABLED 🟢' : 'DISABLED 🔴'}**`, ephemeral: true });
        }
    }

    const userId = interaction.user.id;
    if (!userSessions.has(userId)) userSessions.set(userId, {});
    const session = userSessions.get(userId);

    // B. BUTTONS HANDLER
    if (interaction.isButton()) {
        const id = interaction.customId;

        if (DB.ticketBans.includes(userId) && id.startsWith('panel_')) {
            return interaction.reply({ content: '🔴 You are blacklisted from opening tickets on this server!', ephemeral: true });
        }

        if (id.startsWith('num_')) {
            if (!session.customQtyBuffer) session.customQtyBuffer = '';

            if (id === 'num_C') {
                session.customQtyBuffer = '';
                return interaction.update(buildNumpadUI(session.customQtyBuffer));
            }
            if (id === 'num_back') {
                session.customQtyBuffer = session.customQtyBuffer.slice(0, -1);
                return interaction.update(buildNumpadUI(session.customQtyBuffer));
            }
            if (id === 'num_cancel') {
                userSessions.delete(userId);
                return interaction.update({ content: `${CONFIG.EMOJIS.CROSS} Order cancelled.`, embeds: [], components: [] });
            }
            if (id === 'num_confirm') {
                if (!session.customQtyBuffer || parseInt(session.customQtyBuffer) <= 0) {
                    return interaction.reply({ content: `${CONFIG.EMOJIS.WARNING} Please enter a quantity greater than 0!`, ephemeral: true });
                }
                session.quantity = `${session.customQtyBuffer}x`;
                delete session.customQtyBuffer;

                if (session.category === 'Server Boost') return sendConfirmationSummary(interaction, session);
                else return sendPaymentMenu(interaction);
            }

            const digit = id.replace('num_', '');
            if (session.customQtyBuffer.length < 4) session.customQtyBuffer += digit;
            return interaction.update(buildNumpadUI(session.customQtyBuffer));
        }

        if (id === 'panel_nitro') {
            session.category = 'Nitr0';
            const menu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_nitro_type')
                    .setPlaceholder('Select Nitro Type')
                    .addOptions([
                        { label: 'Nitro Boost', value: 'Nitr0 Boost', description: 'Includes 2 Server Boosts', emoji: CONFIG.EMOJIS.NITRO },
                        { label: 'Nitro Basic', value: 'Nitr0 Basic', description: 'Basic perks without boosts', emoji: CONFIG.EMOJIS.STAR }
                    ])
            );
            return interaction.reply({ content: `${CONFIG.EMOJIS.NITRO} Please select the type of Nitro:`, components: [menu], ephemeral: true });
        }

        if (id === 'panel_deco') {
            session.category = 'Dec0';
            session.product = 'Dec0';
            session.quantity = '1x';
            return sendPaymentMenu(interaction);
        }

        if (id === 'panel_boost') {
            session.category = 'Server Boost';
            session.product = 'Server Boost';
            return sendPaymentMenu(interaction);
        }

        if (id === 'panel_other') {
            session.category = 'Other';
            const modal = new ModalBuilder().setCustomId('modal_other').setTitle('Order Request Details');
            const itemInput = new TextInputBuilder().setCustomId('other_product').setLabel('What do you want to buy?').setStyle(TextInputStyle.Short).setRequired(true);
            const budgetInput = new TextInputBuilder().setCustomId('other_budget').setLabel('What is your budget?').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(itemInput), new ActionRowBuilder().addComponents(budgetInput));
            return interaction.showModal(modal);
        }

        if (id === 'confirm_ticket') return executeTicketCreation(interaction, session);
        if (id === 'cancel_ticket') {
            userSessions.delete(userId);
            return interaction.update({ content: `${CONFIG.EMOJIS.CROSS} Order setup cancelled.`, embeds: [], components: [] });
        }

        if (id === 't_claim') {
            if (!DB.staffStats[userId]) DB.staffStats[userId] = { claimed: 0, closed: 0 };
            DB.staffStats[userId].claimed++;
            return interaction.reply({ content: `${CONFIG.EMOJIS.CLAIM} Ticket claimed by <@${userId}>!`, ephemeral: false });
        }

        if (id === 't_close' || id === 'op_force_close') {
            await interaction.reply({ content: `${CONFIG.EMOJIS.CLOSE} Generating transcript and closing ticket...` });
            if (!DB.staffStats[userId]) DB.staffStats[userId] = { claimed: 0, closed: 0 };
            DB.staffStats[userId].closed++;
            await generateAndSendTranscript(interaction.channel, interaction.user);
            setTimeout(() => interaction.channel.delete().catch(() => {}), 4000);
            return;
        }

        if (id === 't_ping_staff') return interaction.reply({ content: `${CONFIG.EMOJIS.PING} <@&${CONFIG.STAFF_ROLE_ID}> Customer requires staff assistance!`, ephemeral: false });

        if (id === 't_add_user') {
            const modal = new ModalBuilder().setCustomId('modal_ticket_add_user').setTitle('Add User to Ticket');
            const userInput = new TextInputBuilder().setCustomId('target_user_id').setLabel('Enter User ID:').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(userInput));
            return interaction.showModal(modal);
        }

        if (id === 't_remove_user') {
            const modal = new ModalBuilder().setCustomId('modal_ticket_remove_user').setTitle('Remove User from Ticket');
            const userInput = new TextInputBuilder().setCustomId('target_user_id').setLabel('Enter User ID:').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(userInput));
            return interaction.showModal(modal);
        }

        if (id === 't_change_qty') {
            const modal = new ModalBuilder().setCustomId('modal_ticket_change_qty').setTitle('Change Order Quantity');
            const qtyInput = new TextInputBuilder().setCustomId('new_qty').setLabel('Enter New Quantity:').setStyle(TextInputStyle.Short).setPlaceholder('e.g. 5x').setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(qtyInput));
            return interaction.showModal(modal);
        }

        if (id === 't_transcript') {
            await interaction.deferReply({ ephemeral: true });
            await generateAndSendTranscript(interaction.channel, interaction.user);
            return interaction.editReply({ content: `${CONFIG.EMOJIS.TRANSCRIPT} Transcript generated and sent to logs channel!` });
        }

        if (id === 'op_ban_ticket') {
            const ownerOverwrite = interaction.channel.permissionOverwrites.cache.find(o => o.type === 1);
            if (ownerOverwrite) {
                DB.ticketBans.push(ownerOverwrite.id);
                return interaction.reply({ content: `🚫 User <@${ownerOverwrite.id}> added to the ticket blacklist!` });
            }
        }
    }

    // C. SELECT MENUS HANDLER
    if (interaction.isStringSelectMenu()) {
        const id = interaction.customId;
        const value = interaction.values[0];

        if (id === 'ticket_category_select') {
            if (value === 'panel_nitro') return client.emit('interactionCreate', { ...interaction, isButton: () => true, customId: 'panel_nitro' });
            if (value === 'panel_deco') return client.emit('interactionCreate', { ...interaction, isButton: () => true, customId: 'panel_deco' });
            if (value === 'panel_boost') return client.emit('interactionCreate', { ...interaction, isButton: () => true, customId: 'panel_boost' });
            if (value === 'panel_other') return client.emit('interactionCreate', { ...interaction, isButton: () => true, customId: 'panel_other' });
        }

        if (id === 'select_nitro_type') {
            session.product = value;
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_nitro_qty')
                    .setPlaceholder('Select Quantity')
                    .addOptions([
                        { label: '1x Quantity', value: '1x', emoji: '1️⃣' },
                        { label: '2x Quantity', value: '2x', emoji: '2️⃣' },
                        { label: '3x Quantity', value: '3x', emoji: '3️⃣' },
                        { label: 'Custom Amount', value: 'custom', description: 'Open numeric keypad', emoji: CONFIG.EMOJIS.CHANGE_QTY }
                    ])
            );
            return interaction.update({ content: `${CONFIG.EMOJIS.CHECK} Selected: **${value}**. Now select quantity:`, components: [row] });
        }

        if (id === 'select_nitro_qty') {
            if (value === 'custom') {
                session.customQtyBuffer = '';
                return interaction.update(buildNumpadUI(''));
            } else {
                session.quantity = value;
                return sendPaymentMenu(interaction);
            }
        }

        if (id === 'select_payment') {
            session.payment = value;
            if (session.category === 'Server Boost') {
                const row = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('select_boost_duration')
                        .setPlaceholder('Select Boost Duration')
                        .addOptions([
                            { label: '1 Month Duration', value: '1 Month', emoji: '📅' },
                            { label: '3 Months Duration', value: '3 Months', emoji: '🗓️' }
                        ])
                );
                return interaction.update({ content: `${CONFIG.EMOJIS.BOOST} Select duration for your Server Boosts:`, components: [row] });
            }
            return sendConfirmationSummary(interaction, session);
        }

        if (id === 'select_boost_duration') {
            session.duration = value;
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_boost_qty')
                    .setPlaceholder('Select Number of Boosts')
                    .addOptions([
                        { label: '14x Boosts', value: '14x', emoji: CONFIG.EMOJIS.BOOST },
                        { label: '28x Boosts', value: '28x', emoji: CONFIG.EMOJIS.BOOST },
                        { label: 'Custom Amount', value: 'custom', description: 'Open numeric keypad', emoji: CONFIG.EMOJIS.CHANGE_QTY }
                    ])
            );
            return interaction.update({ content: `${CONFIG.EMOJIS.BOOST} Select how many boosts you want:`, components: [row] });
        }

        if (id === 'select_boost_qty') {
            if (value === 'custom') {
                session.customQtyBuffer = '';
                return interaction.update(buildNumpadUI(''));
            } else {
                session.quantity = value;
                return sendConfirmationSummary(interaction, session);
            }
        }
    }

    // D. MODALS HANDLER
    if (interaction.isModalSubmit()) {
        const id = interaction.customId;

        if (id === 'modal_other') {
            session.product = interaction.fields.getTextInputValue('other_product');
            session.budget = interaction.fields.getTextInputValue('other_budget');
            session.quantity = '1x';
            return sendPaymentMenu(interaction);
        }

        if (id === 'modal_ticket_add_user') {
            const targetId = interaction.fields.getTextInputValue('target_user_id');
            try {
                await interaction.channel.permissionOverwrites.edit(targetId, { ViewChannel: true, SendMessages: true, AttachFiles: true });
                return interaction.reply({ content: `${CONFIG.EMOJIS.CHECK} Added <@${targetId}> to this ticket.` });
            } catch (err) {
                return interaction.reply({ content: `${CONFIG.EMOJIS.CROSS} Invalid User ID or missing permissions.`, ephemeral: true });
            }
        }

        if (id === 'modal_ticket_remove_user') {
            const targetId = interaction.fields.getTextInputValue('target_user_id');
            try {
                await interaction.channel.permissionOverwrites.delete(targetId);
                return interaction.reply({ content: `${CONFIG.EMOJIS.REMOVE_USER} Removed <@${targetId}> from this ticket.` });
            } catch (err) {
                return interaction.reply({ content: `${CONFIG.EMOJIS.CROSS} Invalid User ID or missing permissions.`, ephemeral: true });
            }
        }

        if (id === 'modal_ticket_change_qty') {
            const newQty = interaction.fields.getTextInputValue('new_qty');
            try {
                const message = interaction.message;
                if (message && message.embeds.length > 0) {
                    const oldEmbed = message.embeds[0];
                    const updatedDescription = oldEmbed.description.replace(/\*\*Quantity:\*\* .*/, `**Quantity:** ${newQty}`);
                    const newEmbed = EmbedBuilder.from(oldEmbed).setDescription(updatedDescription);
                    await message.edit({ embeds: [newEmbed] });
                    return interaction.reply({ content: `${CONFIG.EMOJIS.CART} Order quantity updated to **${newQty}**!`, ephemeral: true });
                }
            } catch (err) {
                return interaction.reply({ content: `${CONFIG.EMOJIS.CROSS} Could not update embed.`, ephemeral: true });
            }
        }
    }
});
// ==============================================================================
// 9. HELPER FUNCTIONS
// ==============================================================================
async function sendPaymentMenu(interaction) {
    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('select_payment')
            .setPlaceholder('Select Payment Method')
            .addOptions([
                { label: 'Bank Transfer', value: 'Bank Transfer', emoji: '🏦' },
                { label: 'PayPal', value: 'PayPal', emoji: '🅿️' },
                { label: 'Crypto', value: 'Crypto', emoji: '🪙' }
            ])
    );

    const payload = { content: `${CONFIG.EMOJIS.CARD} Please select your preferred payment method:`, embeds: [], components: [row] };
    if (interaction.isButton() && interaction.customId.startsWith('panel_')) return interaction.reply({ ...payload, ephemeral: true });
    else if (interaction.isModalSubmit() && interaction.customId === 'modal_other') return interaction.reply({ ...payload, ephemeral: true });
    else return interaction.update(payload);
}

async function sendConfirmationSummary(interaction, session) {
    const embed = new EmbedBuilder()
        .setTitle(`${CONFIG.EMOJIS.CART} Order Confirmation Summary`)
        .setColor(CONFIG.COLOR_PRIMARY)
        .addFields(
            { name: 'Category', value: `\`${session.category || 'N/A'}\``, inline: true },
            { name: 'Product', value: `\`${session.product || 'N/A'}\``, inline: true },
            { name: 'Quantity', value: `\`${session.quantity || '1x'}\``, inline: true },
            { name: 'Payment Method', value: `\`${session.payment || 'N/A'}\``, inline: true },
            { name: 'Price', value: '`Discuss in ticket`', inline: true }
        );

    if (session.duration) embed.addFields({ name: 'Duration', value: `\`${session.duration}\``, inline: true });
    if (session.budget) embed.addFields({ name: 'Budget', value: `\`${session.budget}\``, inline: true });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_ticket').setLabel('Open Ticket').setStyle(ButtonStyle.Success).setEmoji(CONFIG.EMOJIS.CHECK),
        new ButtonBuilder().setCustomId('cancel_ticket').setLabel('Cancel').setStyle(ButtonStyle.Danger).setEmoji(CONFIG.EMOJIS.CROSS)
    );

    return interaction.update({ content: 'Please review your selection before opening the ticket:', embeds: [embed], components: [row] });
}

async function executeTicketCreation(interaction, session) {
    const guild = interaction.guild;
    const user = interaction.user;

    let pingRoleId = CONFIG.PINGS.OTHER;
    if (session.category === 'Nitr0') pingRoleId = CONFIG.PINGS.NITRO;
    if (session.category === 'Dec0') pingRoleId = CONFIG.PINGS.DECO;
    if (session.category === 'Server Boost') pingRoleId = CONFIG.PINGS.BOOST;

    const channelName = `${session.category.toLowerCase().replace(/\s+/g, '')}-${user.username}`;

    const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles] },
            { id: CONFIG.STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages] }
        ],
    });

    if (!DB.clientHistory[user.id]) DB.clientHistory[user.id] = { total: 0, closed: 0 };
    DB.clientHistory[user.id].total++;

    const randomUUID = Math.random().toString(36).substring(2, 10) + '-ec14-40a6-9794-' + Math.random().toString(36).substring(2, 12);

    const ticketEmbed = new EmbedBuilder()
        .setColor(CONFIG.COLOR_TICKET)
        .setDescription(`🦋 | **${session.product}**\n<@${user.id}> • \`${randomUUID}\`\n\n**Method:** ${session.payment}\n**Quantity:** ${session.quantity}\n**Product:** ${session.product}\n**Amount:** **Discuss in ticket**`);

    if (CONFIG.BANNER_URL) ticketEmbed.setImage(CONFIG.BANNER_URL);

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('t_claim').setLabel('Claim').setStyle(ButtonStyle.Primary).setEmoji(CONFIG.EMOJIS.CLAIM),
        new ButtonBuilder().setCustomId('t_transcript').setLabel('Transcript').setStyle(ButtonStyle.Secondary).setEmoji(CONFIG.EMOJIS.TRANSCRIPT)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('t_add_user').setLabel('Add User').setStyle(ButtonStyle.Secondary).setEmoji(CONFIG.EMOJIS.ADD_USER),
        new ButtonBuilder().setCustomId('t_remove_user').setLabel('Remove User').setStyle(ButtonStyle.Secondary).setEmoji(CONFIG.EMOJIS.REMOVE_USER)
    );
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('t_change_qty').setLabel('Change Quantity').setStyle(ButtonStyle.Secondary).setEmoji(CONFIG.EMOJIS.CHANGE_QTY),
        new ButtonBuilder().setCustomId('t_ping_staff').setLabel('Ping Staff').setStyle(ButtonStyle.Secondary).setEmoji(CONFIG.EMOJIS.PING)
    );
    const row4 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('t_close').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji(CONFIG.EMOJIS.CLOSE)
    );

    await channel.send({ content: `<@${user.id}> <@&${pingRoleId}>`, embeds: [ticketEmbed], components: [row1, row2, row3, row4] });

    userSessions.delete(user.id);

    return interaction.update({ content: `${CONFIG.EMOJIS.CHECK} Your ticket has been created: ${channel}`, embeds: [], components: [] });
}

// ==============================================================================
// 10. MESSAGE LISTENER (PREFIX COMMANDS + SECURITY)
// ==============================================================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // A. PREFIX COMMAND HANDLER (!help, !setup-tickets, !owner-panel)
    const content = message.content.trim();
    if (content.startsWith('!')) {
        const args = content.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        if (command === 'help') {
            return message.channel.send({ embeds: [buildHelpEmbed()] });
        }

        if (command === 'setup-tickets') {
            if (!isOwnerOrAdmin(message.author, message.member, message.guild)) {
                return message.channel.send('❌ Access Denied (Owner/Admin Only).');
            }
            return message.channel.send(buildMainPanel());
        }

        if (command === 'owner-panel') {
            if (!isOwnerOrAdmin(message.author, message.member, message.guild)) {
                return message.channel.send('❌ Access Denied (Owner/Admin Only).');
            }

            const embed = new EmbedBuilder()
                .setTitle('👑 VNS Market - Owner Emergency Panel')
                .setDescription('Select an administrative action for this channel/client:')
                .setColor('#FF0000');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('op_force_close').setLabel('Force Close').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
                new ButtonBuilder().setCustomId('op_reassign').setLabel('Reassign Staff').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
                new ButtonBuilder().setCustomId('op_ban_ticket').setLabel('Ban from Tickets').setStyle(ButtonStyle.Primary).setEmoji('🚫')
            );

            return message.channel.send({ embeds: [embed], components: [row] });
        }
    }

    // B. SECURITY CHECKS (ANTI-LINK, ANTI-SPAM)
    if (message.author.id === CONFIG.OWNER_ID || isStaff(message.member)) return;

    if (CONFIG.SECURITY.ANTI_LINK) {
        if (/(https?:\/\/[^\s]+)/g.test(message.content)) {
            await message.delete().catch(() => {});
            return message.channel.send(`⚠️ <@${message.author.id}>, sending links is not allowed!`).then(m => setTimeout(() => m.delete().catch(() => {}), 4000));
        }
    }

    if (CONFIG.SECURITY.ANTI_SPAM) {
        const now = Date.now();
        const userData = spamTracker.get(message.author.id) || { count: 0, lastMsg: now };

        if (now - userData.lastMsg < 2000) {
            userData.count++;
            if (userData.count >= 4) {
                await message.member.timeout(5 * 60 * 1000, 'Anti-Spam Triggered').catch(() => {});
                await message.channel.send(`🔇 <@${message.author.id}> has been muted for 5 minutes (Spam Protection).`);
                spamTracker.delete(message.author.id);
                return;
            }
        } else {
            userData.count = 1;
        }
        userData.lastMsg = now;
        spamTracker.set(message.author.id, userData);
    }
});

client.on('guildMemberAdd', async (member) => {
    if (!CONFIG.SECURITY.ANTI_RAID) return;
    const now = Date.now();
    recentJoins.push(now);
    const recent = recentJoins.filter(t => now - t < 10000);
    if (recent.length > 5) {
        await member.kick('Anti-Raid triggered').catch(() => {});
    }
});

// ==============================================================================
// 11. BOT LOGIN
// ==============================================================================
client.login(CONFIG.TOKEN);
