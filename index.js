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

// Web server for Uptime / Keep-Alive
const app = express();
app.get('/', (req, res) => res.send('⚡ VNS Market Ticket Bot Online!'));
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
// 2. CONFIGURATION & SETTINGS
// ==============================================================================
const CONFIG = {
    TOKEN: process.env.DISCORD_TOKEN,
    CLIENT_ID: process.env.CLIENT_ID,
    GUILD_ID: process.env.GUILD_ID,

    COLOR_PRIMARY: '#2B2D31',
    COLOR_TICKET: '#5865F2',
    
    // YOUR DATA:
    OWNER_ID: '1526468347162788096',
    STAFF_ROLE_ID: '1534625944017571941',
    TRANSCRIPT_CHANNEL_ID: '1534479829225832528', 
    TICKET_CATEGORY_ID: '', // Optional: Put the category ID where tickets should be created

    BANNER_URL: 'https://cdn.discordapp.com/attachments/1531290394242056344/1537451917893181580/standard_2.gif?ex=6a7f172d&is=6a7dc5ad&hm=e6ecd8fe90fd79822e1f5efe2efcdabdaf32d3f072fc7359f29237eb1217186d&', 
    
    PINGS: {
        NITRO: '1534479829225832528',
        DECO: '1534480089083936789',
        BOOST: '1534480275474612254',
        OTHER: '1535562946107809883'
    },

    EMOJIS: {
        NITRO: '🚀', DECO: '🎨', BOOST: '⚡', OTHER: '🎁', CLAIM: '🔔',
        TRANSCRIPT: '📜', ADD_USER: '➕', REMOVE_USER: '➖', CHANGE_QTY: '🔢',
        PING: '📢', CLOSE: '🔒', CHECK: '✅', SPARKLES: '✨', CART: '🛒',
        CARD: '💳', CROSS: '❌', WARNING: '⚠️', STAR: '⭐'
    }
};

const userSessions = new Map();

function isOwnerOrAdmin(user, member, guild) {
    if (!user) return false;
    return user.id === CONFIG.OWNER_ID || 
           guild?.ownerId === user.id || 
           member?.permissions?.has(PermissionFlagsBits.Administrator);
}

function isStaff(member) {
    if (!member) return false;
    return member.roles.cache.has(CONFIG.STAFF_ROLE_ID) || member.id === CONFIG.OWNER_ID || member.permissions.has(PermissionFlagsBits.Administrator);
}

// ==============================================================================
// 3. MAIN TICKET PANEL
// ==============================================================================
function buildMainPanel() {
    const embed = new EmbedBuilder()
        .setTitle(`${CONFIG.EMOJIS.SPARKLES} **VNS Market Tickets** ${CONFIG.EMOJIS.SPARKLES}`)
        .setDescription('🌙 **Support Center** — Select a category below or use the buttons to open a ticket.')
        .setColor(CONFIG.COLOR_PRIMARY);

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('ticket_category_select')
        .setPlaceholder('Choose a category...')
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
// 4. SLASH COMMAND REGISTRATION & INITIALIZATION
// ==============================================================================
const slashCommands = [
    new SlashCommandBuilder().setName('help').setDescription('Display bot help guide'),
    new SlashCommandBuilder().setName('setup-tickets').setDescription('Deploy the ticket panel (Owner/Admin Only)'),
    new SlashCommandBuilder().setName('rename').setDescription('Rename the ticket channel').addStringOption(opt => opt.setName('name').setDescription('New channel name').setRequired(true))
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
    console.log(`=================================`);
    console.log(`✅ Bot is online as: ${client.user.tag}`);
    console.log(`=================================`);

    const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN);
    try {
        await rest.put(Routes.applicationGuildCommands(CONFIG.CLIENT_ID, CONFIG.GUILD_ID), { body: slashCommands });
        console.log('✨ Slash Commands registered successfully!');
    } catch (err) {
        console.error('❌ Error registering Slash Commands:', err);
    }
});

// ==============================================================================
// 5. INTERACTION ENGINE (BUTTONS, DROPDOWNS, MODALS)
// ==============================================================================
client.on('interactionCreate', async (interaction) => {
    const userId = interaction.user.id;
    
    if (!userSessions.has(userId)) {
        userSessions.set(userId, { category: '', product: '', quantity: '1x', payment: '' });
    }
    const session = userSessions.get(userId);

    // A. SLASH COMMANDS
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'help') {
            return interaction.reply({ content: 'Use `!setup-tickets` or `/setup-tickets` to deploy the ticket panel.', ephemeral: true });
        }
        if (interaction.commandName === 'setup-tickets') {
            if (!isOwnerOrAdmin(interaction.user, interaction.member, interaction.guild)) {
                return interaction.reply({ content: '❌ Access Denied (Owner/Admin Only).', ephemeral: true });
            }
            return interaction.reply(buildMainPanel());
        }
        if (interaction.commandName === 'rename') {
            if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Access Denied.', ephemeral: true });
            const name = interaction.options.getString('name');
            await interaction.channel.setName(name);
            return interaction.reply({ content: `✅ Channel renamed to **${name}**` });
        }
    }

    // B. CATEGORY LOGIC
    const handleCategorySelect = async (category) => {
        if (category === 'panel_nitro') {
            session.category = 'Nitr0';
            const menu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_nitro_type')
                    .setPlaceholder('Select Nitro Type')
                    .addOptions([
                        { label: 'Nitro Boost', value: 'Nitr0 Boost', emoji: CONFIG.EMOJIS.NITRO },
                        { label: 'Nitro Basic', value: 'Nitr0 Basic', emoji: CONFIG.EMOJIS.STAR }
                    ])
            );
            return interaction.reply({ content: `${CONFIG.EMOJIS.NITRO} Select Nitro type:`, components: [menu], ephemeral: true });
        }

        if (category === 'panel_deco') {
            session.category = 'Dec0';
            session.product = 'Dec0';
            session.quantity = '1x';
            return sendPaymentMenu(interaction);
        }

        if (category === 'panel_boost') {
            session.category = 'Server Boost';
            session.product = 'Server Boost';
            return sendPaymentMenu(interaction);
        }

        if (category === 'panel_other') {
            session.category = 'Other';
            const modal = new ModalBuilder().setCustomId('modal_other').setTitle('Order Request Details');
            const itemInput = new TextInputBuilder().setCustomId('other_product').setLabel('What would you like to buy?').setStyle(TextInputStyle.Short).setRequired(true);
            const budgetInput = new TextInputBuilder().setCustomId('other_budget').setLabel('What is your budget?').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(itemInput), new ActionRowBuilder().addComponents(budgetInput));
            return interaction.showModal(modal);
        }
    };

    // C. BUTTONS
    if (interaction.isButton()) {
        const id = interaction.customId;

        if (id.startsWith('panel_')) return handleCategorySelect(id);
        if (id === 'confirm_ticket') return executeTicketCreation(interaction, session);
        if (id === 'cancel_ticket') {
            userSessions.delete(userId);
            return interaction.update({ content: '❌ Order cancelled.', embeds: [], components: [] });
        }

        if (id === 't_close') {
            await interaction.reply({ content: '🔒 Generating transcript and closing ticket in 3 seconds...' });
            await generateTranscript(interaction.channel, interaction.user);
            setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
            return;
        }

        if (id === 't_claim') {
            return interaction.reply({ content: `🔔 Ticket claimed by <@${userId}>!` });
        }

        if (id === 't_ping_staff') {
            return interaction.reply({ content: `📢 <@&${CONFIG.STAFF_ROLE_ID}> Customer is requesting staff assistance!` });
        }
    }

    // D. DROPDOWNS
    if (interaction.isStringSelectMenu()) {
        const id = interaction.customId;
        const val = interaction.values[0];

        if (id === 'ticket_category_select') return handleCategorySelect(val);
        if (id === 'select_nitro_type') {
            session.product = val;
            session.quantity = '1x';
            return sendPaymentMenu(interaction);
        }
        if (id === 'select_payment') {
            session.payment = val;
            return sendConfirmationSummary(interaction, session);
        }
    }

    // E. MODALS
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'modal_other') {
            session.product = interaction.fields.getTextInputValue('other_product');
            session.budget = interaction.fields.getTextInputValue('other_budget');
            session.quantity = '1x';
            return sendPaymentMenu(interaction);
        }
    }
});

// ==============================================================================
// 6. TICKET CREATION LOGIC (FIXED & TIMEOUT PROOF)
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

    const data = { content: `${CONFIG.EMOJIS.CARD} Select your preferred payment method:`, embeds: [], components: [row], ephemeral: true };
    if (interaction.replied || interaction.deferred) return interaction.followUp(data);
    if (interaction.isModalSubmit()) return interaction.reply(data);
    return interaction.update(data);
}

async function sendConfirmationSummary(interaction, session) {
    const embed = new EmbedBuilder()
        .setTitle(`${CONFIG.EMOJIS.CART} Order Confirmation`)
        .setColor(CONFIG.COLOR_PRIMARY)
        .addFields(
            { name: 'Category', value: `\`${session.category || 'General'}\``, inline: true },
            { name: 'Product', value: `\`${session.product || 'Standard'}\``, inline: true },
            { name: 'Quantity', value: `\`${session.quantity || '1x'}\``, inline: true },
            { name: 'Payment Method', value: `\`${session.payment || 'N/A'}\``, inline: true }
        );

    if (session.budget) embed.addFields({ name: 'Budget', value: `\`${session.budget}\``, inline: true });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_ticket').setLabel('Open Ticket').setStyle(ButtonStyle.Success).setEmoji(CONFIG.EMOJIS.CHECK),
        new ButtonBuilder().setCustomId('cancel_ticket').setLabel('Cancel').setStyle(ButtonStyle.Danger).setEmoji(CONFIG.EMOJIS.CROSS)
    );

    return interaction.update({ content: 'Click the button below to open your ticket channel:', embeds: [embed], components: [row] });
}

async function executeTicketCreation(interaction, session) {
    // Prevents Discord 3-second timeout
    await interaction.deferUpdate();

    const guild = interaction.guild;
    const user = interaction.user;

    let pingRoleId = CONFIG.PINGS.OTHER;
    if (session.category === 'Nitr0') pingRoleId = CONFIG.PINGS.NITRO;
    if (session.category === 'Dec0') pingRoleId = CONFIG.PINGS.DECO;
    if (session.category === 'Server Boost') pingRoleId = CONFIG.PINGS.BOOST;

    const channelName = `${(session.category || 'ticket').toLowerCase().replace(/\s+/g, '')}-${user.username}`;

    try {
        const channelOptions = {
            name: channelName,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles] },
                { id: CONFIG.STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages] }
            ]
        };

        if (CONFIG.TICKET_CATEGORY_ID) {
            channelOptions.parent = CONFIG.TICKET_CATEGORY_ID;
        }

        const channel = await guild.channels.create(channelOptions);

        const ticketEmbed = new EmbedBuilder()
            .setColor(CONFIG.COLOR_TICKET)
            .setTitle(`🎫 Ticket Order - ${session.product || 'Support'}`)
            .setDescription(`Client: <@${user.id}>\n\n**Payment Method:** ${session.payment || 'N/A'}\n**Quantity:** ${session.quantity || '1x'}\n**Product:** ${session.product || 'N/A'}\n**Price:** Discuss in ticket`);

        if (CONFIG.BANNER_URL) ticketEmbed.setImage(CONFIG.BANNER_URL);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('t_claim').setLabel('Claim Ticket').setStyle(ButtonStyle.Primary).setEmoji(CONFIG.EMOJIS.CLAIM),
            new ButtonBuilder().setCustomId('t_ping_staff').setLabel('Ping Staff').setStyle(ButtonStyle.Secondary).setEmoji(CONFIG.EMOJIS.PING),
            new ButtonBuilder().setCustomId('t_close').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji(CONFIG.EMOJIS.CLOSE)
        );

        await channel.send({ content: `<@${user.id}> <@&${pingRoleId}>`, embeds: [ticketEmbed], components: [row] });
        userSessions.delete(user.id);

        return interaction.editReply({ content: `✅ Your ticket has been created: ${channel}`, embeds: [], components: [] });
    } catch (error) {
        console.error('Error creating channel:', error);
        return interaction.editReply({ content: '❌ Could not create ticket channel. Make sure the bot has "Manage Channels" permission!', embeds: [], components: [] });
    }
}

// Generate Simple Transcript to Log Channel
async function generateTranscript(channel, user) {
    if (!CONFIG.TRANSCRIPT_CHANNEL_ID) return;
    try {
        const messages = await channel.messages.fetch({ limit: 100 });
        let text = `TRANSCRIPT FOR ${channel.name} (Closed by ${user.tag}):\n\n`;
        messages.reverse().forEach(m => text += `[${m.createdAt.toLocaleString()}] ${m.author.tag}: ${m.content}\n`);

        const logChannel = await channel.guild.channels.fetch(CONFIG.TRANSCRIPT_CHANNEL_ID).catch(() => null);
        if (logChannel) {
            const attachment = new AttachmentBuilder(Buffer.from(text, 'utf-8'), { name: `transcript-${channel.name}.txt` });
            await logChannel.send({ content: `📜 Transcript generated for \`${channel.name}\``, files: [attachment] });
        }
    } catch (e) {
        console.error('Transcript error:', e);
    }
}

// ==============================================================================
// 7. PREFIX MESSAGE LISTENER (!setup-tickets / !help)
// ==============================================================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const content = message.content.trim();
    if (content.startsWith('!')) {
        const command = content.slice(1).trim().split(/ +/)[0].toLowerCase();

        if (command === 'setup-tickets') {
            if (!isOwnerOrAdmin(message.author, message.member, message.guild)) {
                return message.channel.send('❌ Access Denied (Owner/Admin Only).');
            }
            return message.channel.send(buildMainPanel());
        }

        if (command === 'help') {
            return message.channel.send('💡 Use `!setup-tickets` or `/setup-tickets` to deploy the ticket panel.');
        }
    }
});

client.login(CONFIG.TOKEN);
                                       
