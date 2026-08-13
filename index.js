// ==============================================================================
// 1. MODULES & SERVER SETUP (KEEP-ALIVE FOR RENDER)
// ==============================================================================
const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    EmbedBuilder, 
    PermissionsBitField, 
    ChannelType 
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
    ]
});

// ==============================================================================
// 2. CONFIGURATIONS & CONSTANTS
// ==============================================================================
const CONFIG = {
    COLOR_PRIMARY: '#2B2D31',
    COLOR_TICKET: '#5865F2',
    STAFF_ROLE_ID: '1534625944017571941',
    PINGS: {
        NITRO: '1534479829225832528',
        DECO: '1534480089083936789',
        BOOST: '1534480275474612254',
        OTHER: '1535562946107809883'
    },
    BANNER_URL: 'https://i.imgur.com/8Q73NqF.png'
};

const userSessions = new Map();

// ==============================================================================
// 3. READY EVENT & SLASH COMMANDS
// ==============================================================================
client.on('ready', async () => {
    console.log(`=================================`);
    console.log(`✅ Logged in as: ${client.user.tag}`);
    console.log(`=================================`);

    const commands = [
        {
            name: 'setup-tickets',
            description: 'Deploy the official VNS Market Tickets panel',
            default_member_permissions: PermissionsBitField.Flags.Administrator.toString()
        }
    ];

    try {
        await client.application.commands.set(commands);
        console.log('✨ Registered /setup-tickets slash command globally!');
    } catch (error) {
        console.error('❌ Failed to register slash command:', error);
    }
});

// ==============================================================================
// 4. MAIN PANEL BUILDER
// ==============================================================================
function buildMainPanel() {
    const embed = new EmbedBuilder()
        .setTitle('**VNS Market Tickets**')
        .setDescription('🌙 **Staff offline** — We will respond as soon as possible.\n\nSelect a category below to open a ticket.')
        .setColor(CONFIG.COLOR_PRIMARY);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('panel_nitro').setLabel('Nitr0').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('panel_deco').setLabel('Dec0').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('panel_boost').setLabel('server b00st').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('panel_other').setLabel('other').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

client.on('messageCreate', async (message) => {
    if (message.content === '!setup-tickets' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        await message.channel.send(buildMainPanel());
        await message.delete().catch(() => {});
    }
});

// ==============================================================================
// 5. INTERACTION ENGINE (SMART EPHEMERAL UPDATES)
// ==============================================================================
client.on('interactionCreate', async (interaction) => {
    // --- A. SLASH COMMANDS ---
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'setup-tickets') {
            return interaction.reply(buildMainPanel());
        }
    }

    const userId = interaction.user.id;
    if (!userSessions.has(userId)) userSessions.set(userId, {});
    const session = userSessions.get(userId);

    // --- B. BUTTON INTERACTIONS ---
    if (interaction.isButton()) {
        const id = interaction.customId;

        // --- STEP 1: BUTTONS ON MAIN PANEL (Create the single Ephemeral message) ---
        if (id === 'panel_nitro') {
            session.category = 'Nitr0';
            const menu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_nitro_type')
                    .setPlaceholder('Select Nitro Type')
                    .addOptions([
                        { label: 'Nitro Boost', value: 'Nitr0 Boost', description: 'Includes 2 Server Boosts' },
                        { label: 'Nitro Basic', value: 'Nitr0 Basic', description: 'Basic perks without boosts' }
                    ])
            );
            return interaction.reply({ content: ' Please select the type of Nitro you need:', components: [menu], ephemeral: true });
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
            const modal = new ModalBuilder()
                .setCustomId('modal_other')
                .setTitle('Order Request Details');

            const itemInput = new TextInputBuilder()
                .setCustomId('other_product')
                .setLabel('What do you want to buy?')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g. Netflix, Spotify, Account...')
                .setRequired(true);

            const budgetInput = new TextInputBuilder()
                .setCustomId('other_budget')
                .setLabel('What is your budget?')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g. $10, 50 RON...')
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(itemInput),
                new ActionRowBuilder().addComponents(budgetInput)
            );

            return interaction.showModal(modal);
        }

        // --- STEP 2: CONFIRM / CANCEL BUTTONS INSIDE EPHEMERAL ---
        if (id === 'confirm_ticket') {
            return executeTicketCreation(interaction, session);
        }

        if (id === 'cancel_ticket') {
            userSessions.delete(userId);
            return interaction.update({ content: '❌ Order setup cancelled.', embeds: [], components: [] });
        }

        // --- BUTTONS INSIDE OPENED TICKET CHANNEL ---
        if (id === 't_claim') {
            return interaction.reply({ content: `🔔 Ticket claimed by <@${interaction.user.id}>!`, ephemeral: false });
        }
        if (id === 't_close') {
            await interaction.reply({ content: '🔒 Closing ticket in 5 seconds...' });
            setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
            return;
        }
        if (id === 't_ping_staff') {
            return interaction.reply({ content: `<@&${CONFIG.STAFF_ROLE_ID}> Customer requires staff assistance!`, ephemeral: false });
        }
        if (['t_transcript', 't_add_user', 't_remove_user', 't_change_qty', 't_mm'].includes(id)) {
            const actionName = id.replace('t_', '').toUpperCase();
            return interaction.reply({ content: `ℹ️ Selected action: **${actionName}**`, ephemeral: true });
        }
    }

    // --- C. SELECT MENUS (Edit the existing ephemeral message) ---
    if (interaction.isStringSelectMenu()) {
        const id = interaction.customId;
        const value = interaction.values[0];

        if (id === 'select_nitro_type') {
            session.product = value;
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_nitro_qty')
                    .setPlaceholder('Select Quantity')
                    .addOptions([
                        { label: '1x Quantity', value: '1x' },
                        { label: '2x Quantity', value: '2x' },
                        { label: '3x Quantity', value: '3x' },
                        { label: '4x Quantity', value: '4x' },
                        { label: 'Custom Amount', value: 'custom', description: 'Specify custom quantity' }
                    ])
            );
            return interaction.update({ content: ` Selected: **${value}**. Now select the quantity:`, components: [row] });
        }

        if (id === 'select_nitro_qty') {
            if (value === 'custom') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_nitro_qty')
                    .setTitle('Custom Nitro Quantity');
                const qtyInput = new TextInputBuilder()
                    .setCustomId('nitro_custom_qty')
                    .setLabel('Enter quantity count:')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(qtyInput));
                return interaction.showModal(modal);
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
                            { label: '1 Month Duration', value: '1 Month' },
                            { label: '3 Months Duration', value: '3 Months' }
                        ])
                );
                return interaction.update({ content: ' Select duration for your Server Boosts:', components: [row] });
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
                        { label: '14x Boosts', value: '14x' },
                        { label: '28x Boosts', value: '28x' },
                        { label: 'Custom Amount', value: 'custom', description: 'Enter specific boost amount' }
                    ])
            );
            return interaction.update({ content: ' Select how many boosts you want:', components: [row] });
        }

        if (id === 'select_boost_qty') {
            if (value === 'custom') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_boost_qty')
                    .setTitle('Custom Boost Quantity');
                const qtyInput = new TextInputBuilder()
                    .setCustomId('boost_custom_qty')
                    .setLabel('Enter boost count:')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(qtyInput));
                return interaction.showModal(modal);
            } else {
                session.quantity = value;
                return sendConfirmationSummary(interaction, session);
            }
        }
    }

    // --- D. MODAL SUBMITS (Edit the existing ephemeral message) ---
    if (interaction.isModalSubmit()) {
        const id = interaction.customId;

        if (id === 'modal_nitro_qty') {
            session.quantity = `${interaction.fields.getTextInputValue('nitro_custom_qty')}x`;
            return sendPaymentMenu(interaction);
        }

        if (id === 'modal_boost_qty') {
            session.quantity = `${interaction.fields.getTextInputValue('boost_custom_qty')}x`;
            return sendConfirmationSummary(interaction, session);
        }

        if (id === 'modal_other') {
            session.product = interaction.fields.getTextInputValue('other_product');
            session.budget = interaction.fields.getTextInputValue('other_budget');
            session.quantity = '1x';
            return sendPaymentMenu(interaction);
        }
    }
});

// ==============================================================================
// 6. HELPER FUNCTIONS (EPHEMERAL MANAGERS)
// ==============================================================================

// Display Payment Select Menu
async function sendPaymentMenu(interaction) {
    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('select_payment')
            .setPlaceholder('Select Payment Method')
            .addOptions([
                { label: 'Bank Transfer', value: 'Bank Transfer' },
                { label: 'PayPal', value: 'PayPal' },
                { label: 'Crypto', value: 'Crypto' }
            ])
    );

    const payload = { content: '💳 Please select your preferred payment method:', embeds: [], components: [row] };
    
    // If triggered directly from main panel buttons (Deco / Boost), create Ephemeral reply.
    if (interaction.isButton() && interaction.customId.startsWith('panel_')) {
        return interaction.reply({ ...payload, ephemeral: true });
    } 
    // If triggered from modal submit (Other category) or select menu, create/update accordingly.
    else if (interaction.isModalSubmit() && interaction.customId === 'modal_other') {
        return interaction.reply({ ...payload, ephemeral: true });
    } 
    // Otherwise update existing Ephemeral message.
    else {
        return interaction.update(payload);
    }
}

// Display Summary & Ticket Creation Confirmation
async function sendConfirmationSummary(interaction, session) {
    const embed = new EmbedBuilder()
        .setTitle('🛒 Order Confirmation Summary')
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
        new ButtonBuilder().setCustomId('confirm_ticket').setLabel('Open Ticket').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cancel_ticket').setLabel('Cancel').setStyle(ButtonStyle.Danger)
    );

    const payload = { content: 'Please review your selection before opening the ticket:', embeds: [embed], components: [row] };
    
    return interaction.update(payload);
}

// Create Ticket Channel & Send UI
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
            {
                id: guild.roles.everyone.id,
                deny: [PermissionsBitField.Flags.ViewChannel],
            },
            {
                id: user.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles],
            },
            {
                id: CONFIG.STAFF_ROLE_ID,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages],
            }
        ],
    });

    const randomUUID = Math.random().toString(36).substring(2, 10) + '-ec14-40a6-9794-' + Math.random().toString(36).substring(2, 12);

    const ticketEmbed = new EmbedBuilder()
        .setColor(CONFIG.COLOR_TICKET)
        .setDescription(`🦋 | **${session.product}**\n<@${user.id}> • \`${randomUUID}\`\n\n**Method:** ${session.payment}\n**Quantity:** ${session.quantity}\n**Product:** ${session.product}\n**Amount:** **Discuss in ticket**`)
        .setImage(CONFIG.BANNER_URL);

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('t_claim').setLabel('Claim').setStyle(ButtonStyle.Primary).setEmoji('🔔'),
        new ButtonBuilder().setCustomId('t_transcript').setLabel('Transcript').setStyle(ButtonStyle.Secondary).setEmoji('📋')
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('t_add_user').setLabel('Add User').setStyle(ButtonStyle.Secondary).setEmoji('👤'),
        new ButtonBuilder().setCustomId('t_remove_user').setLabel('Remove User').setStyle(ButtonStyle.Secondary).setEmoji('🚫')
    );
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('t_change_qty').setLabel('Change Quantity').setStyle(ButtonStyle.Secondary).setEmoji('🛒')
    );
    const row4 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('t_mm').setLabel('MM').setStyle(ButtonStyle.Primary).setEmoji('🫘'),
        new ButtonBuilder().setCustomId('t_ping_staff').setLabel('Ping Staff').setStyle(ButtonStyle.Secondary).setEmoji('🔔')
    );
    const row5 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('t_close').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒')
    );

    await channel.send({ 
        content: `<@${user.id}> <@&${pingRoleId}>`, 
        embeds: [ticketEmbed], 
        components: [row1, row2, row3, row4, row5] 
    });

    userSessions.delete(user.id);

    return interaction.update({ 
        content: `✅ Your ticket has been created: ${channel}`, 
        embeds: [], 
        components: [] 
    });
}

// ==============================================================================
// 7. BOT LOGIN
// ==============================================================================
client.login(process.env.DISCORD_TOKEN);
                
