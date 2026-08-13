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

// Web server to keep Render service alive
const app = express();
app.get('/', (req, res) => res.send('VNS Market Bot is Online!'));
app.listen(process.env.PORT || 3000);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Role & Category ID Configurations
const STAFF_ROLE_ID = '1534625944017571941';
const PINGS = {
    NITRO: '1534479829225832528',
    DECO: '1534480089083936789',
    BOOST: '1534480275474612254',
    OTHER: '1535562946107809883'
};

// Temporary in-memory session store
const userSessions = new Map();

// BOT READY EVENT + CLEAR OLD SLASH COMMANDS
client.on('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}!`);

    try {
        // Clears all previous global Slash Commands
        await client.application.commands.set([]);
        console.log('🧹 Old Slash Commands cleared successfully from Discord!');
    } catch (error) {
        console.error('Error clearing old commands:', error);
    }
});

// Command to send Main Ticket Panel (!setup-tickets)
client.on('messageCreate', async (message) => {
    if (message.content === '!setup-tickets' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        const embed = new EmbedBuilder()
            .setTitle('**VNS Market Tickets**')
            .setDescription('🌙 **Staff offline** — We will respond as soon as possible.\n\nSelect a category below to open a ticket.')
            .setColor('#2b2d31');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('panel_nitro').setLabel('Nitr0').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('panel_deco').setLabel('Dec0').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('panel_boost').setLabel('server b00st').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('panel_other').setLabel('other').setStyle(ButtonStyle.Secondary)
        );

        await message.channel.send({ embeds: [embed], components: [row] });
        await message.delete().catch(() => {});
    }
});

// Handle All Interactions
client.on('interactionCreate', async (interaction) => {
    const userId = interaction.user.id;
    if (!userSessions.has(userId)) userSessions.set(userId, {});
    const session = userSessions.get(userId);

    // --- 1. MAIN PANEL BUTTONS ---
    if (interaction.isButton()) {
        const id = interaction.customId;

        if (id === 'panel_nitro') {
            session.category = 'Nitr0';
            const menu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_nitro_type')
                    .setPlaceholder('Select Nitro Type')
                    .addOptions([
                        { label: 'Nitro Boost', value: 'Nitr0 Boost' },
                        { label: 'Nitro Basic', value: 'Nitr0 Basic' }
                    ])
            );
            return interaction.reply({ content: 'Select the type of Nitro you want:', components: [menu], ephemeral: true });
        }

        if (id === 'panel_deco') {
            session.category = 'Dec0';
            session.product = 'Dec0';
            session.quantity = '1x';
            return showPaymentMenu(interaction);
        }

        if (id === 'panel_boost') {
            session.category = 'Server Boost';
            session.product = 'Server Boost';
            return showPaymentMenu(interaction);
        }

        if (id === 'panel_other') {
            session.category = 'Other';
            const modal = new ModalBuilder()
                .setCustomId('modal_other')
                .setTitle('Order Request');

            const itemInput = new TextInputBuilder()
                .setCustomId('other_product')
                .setLabel('What do you want to buy?')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const budgetInput = new TextInputBuilder()
                .setCustomId('other_budget')
                .setLabel('What is your budget?')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(itemInput),
                new ActionRowBuilder().addComponents(budgetInput)
            );

            return interaction.showModal(modal);
        }

        // --- TICKET CONFIRMATION BUTTONS ---
        if (id === 'confirm_ticket') {
            return createTicketChannel(interaction, session);
        }

        if (id === 'cancel_ticket') {
            userSessions.delete(userId);
            return interaction.update({ content: '❌ Action cancelled.', embeds: [], components: [] });
        }

        // --- BUTTONS INSIDE OPENED TICKET ---
        if (id === 't_claim') {
            return interaction.reply({ content: `🔔 Ticket claimed by <@${interaction.user.id}>!`, ephemeral: false });
        }
        if (id === 't_close') {
            await interaction.reply({ content: '🔒 Ticket will be closed in 5 seconds...' });
            setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
            return;
        }
        if (id === 't_ping_staff') {
            return interaction.reply({ content: `<@&${STAFF_ROLE_ID}> A customer needs assistance!`, ephemeral: false });
        }
        if (['t_transcript', 't_add_user', 't_remove_user', 't_change_qty', 't_mm'].includes(id)) {
            return interaction.reply({ content: `Selected option: **${id.replace('t_', '')}**`, ephemeral: true });
        }
    }

    // --- 2. SELECT MENUS ---
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
                        { label: '1x', value: '1x' },
                        { label: '2x', value: '2x' },
                        { label: '3x', value: '3x' },
                        { label: '4x', value: '4x' },
                        { label: 'Custom Amount', value: 'custom' }
                    ])
            );
            return interaction.update({ content: `Selected **${value}**. Choose quantity:`, components: [row] });
        }

        if (id === 'select_nitro_qty') {
            if (value === 'custom') {
                const modal = new ModalBuilder()
                    .setCustomId('modal_nitro_qty')
                    .setTitle('Custom Nitro Quantity');
                const qtyInput = new TextInputBuilder()
                    .setCustomId('nitro_custom_qty')
                    .setLabel('Enter quantity:')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(qtyInput));
                return interaction.showModal(modal);
            } else {
                session.quantity = value;
                return showPaymentMenu(interaction);
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
                            { label: '1 Month', value: '1 Month' },
                            { label: '3 Months', value: '3 Months' }
                        ])
                );
                return interaction.update({ content: 'Select duration for Server Boosts:', components: [row] });
            }

            return showConfirmation(interaction, session);
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
                        { label: 'Custom Amount', value: 'custom' }
                    ])
            );
            return interaction.update({ content: 'Select how many boosts you need:', components: [row] });
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
                return showConfirmation(interaction, session);
            }
        }
    }

    // --- 3. MODAL SUBMITS ---
    if (interaction.isModalSubmit()) {
        const id = interaction.customId;

        if (id === 'modal_nitro_qty') {
            session.quantity = `${interaction.fields.getTextInputValue('nitro_custom_qty')}x`;
            return showPaymentMenu(interaction);
        }

        if (id === 'modal_boost_qty') {
            session.quantity = `${interaction.fields.getTextInputValue('boost_custom_qty')}x`;
            return showConfirmation(interaction, session);
        }

        if (id === 'modal_other') {
            session.product = interaction.fields.getTextInputValue('other_product');
            session.budget = interaction.fields.getTextInputValue('other_budget');
            session.quantity = '1x';
            return showPaymentMenu(interaction);
        }
    }
});

// Display Payment Select Menu
async function showPaymentMenu(interaction) {
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

    const payload = { content: 'Please select your preferred payment method:', components: [row], ephemeral: true };
    if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
    } else if (interaction.isStringSelectMenu() || interaction.isButton()) {
        await interaction.update(payload);
    } else {
        await interaction.reply(payload);
    }
}

// Display Summary & Ticket Creation Confirmation
async function showConfirmation(interaction, session) {
    const embed = new EmbedBuilder()
        .setTitle('🛒 Ticket Confirmation')
        .setColor('#2b2d31')
        .addFields(
            { name: 'Category', value: session.category || 'N/A', inline: true },
            { name: 'Product', value: session.product || 'N/A', inline: true },
            { name: 'Quantity', value: session.quantity || '1x', inline: true },
            { name: 'Payment Method', value: session.payment || 'N/A', inline: true },
            { name: 'Price', value: 'Discuss in ticket', inline: true }
        );

    if (session.duration) embed.addFields({ name: 'Duration', value: session.duration, inline: true });
    if (session.budget) embed.addFields({ name: 'User Budget', value: session.budget, inline: true });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_ticket').setLabel('Open Ticket').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cancel_ticket').setLabel('Cancel').setStyle(ButtonStyle.Danger)
    );

    const payload = { content: 'Please review your order details before opening a ticket:', embeds: [embed], components: [row], ephemeral: true };
    
    if (interaction.isModalSubmit()) {
        await interaction.reply(payload);
    } else {
        await interaction.update(payload);
    }
}

// Create Ticket Channel & Send UI (Matches original reference)
async function createTicketChannel(interaction, session) {
    const guild = interaction.guild;
    const user = interaction.user;

    // Get specific Role Ping ID based on selected Category
    let pingRoleId = PINGS.OTHER;
    if (session.category === 'Nitr0') pingRoleId = PINGS.NITRO;
    if (session.category === 'Dec0') pingRoleId = PINGS.DECO;
    if (session.category === 'Server Boost') pingRoleId = PINGS.BOOST;

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
                id: STAFF_ROLE_ID,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages],
            }
        ],
    });

    // Random UUID Generator
    const randomUUID = Math.random().toString(36).substring(2, 10) + '-ec14-40a6-9794-' + Math.random().toString(36).substring(2, 12);

    // Matches Ticket Embed Layout from image
    const ticketEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setDescription(`🦋 | **${session.product}**\n<@${user.id}> • \`${randomUUID}\`\n\n**Method:** ${session.payment}\n**Quantity:** ${session.quantity}\n**Product:** ${session.product}\n**Amount:** **Discuss in ticket**`)
        .setImage('https://i.imgur.com/8Q73NqF.png');

    // Ticket Action Buttons (Matches UI image)
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

    // Send Pings and Embed
    await channel.send({ 
        content: `<@${user.id}> <@&${pingRoleId}>`, 
        embeds: [ticketEmbed], 
        components: [row1, row2, row3, row4, row5] 
    });

    userSessions.delete(user.id);

    return interaction.update({ 
        content: `✅ Your ticket has been created here: ${channel}`, 
        embeds: [], 
        components: [] 
    });
}

client.login(process.env.DISCORD_TOKEN);
            
