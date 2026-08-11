import os
import io
import re
import json
import time
import threading
import requests
import discord
from discord.ext import commands
from discord import app_commands, ui
from bs4 import BeautifulSoup
from flask import Flask

# --- SERVER WEB PENTRU RENDER (Keep-alive) ---
app = Flask(__name__)
@app.route('/')
def home():
    return "Botul All-in-One este activ!"

def run_web_server():
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)

# --- FIȘIER NOTIFICĂRI RESTOCK ---
NOTIF_FILE = "notifications.json"

def load_notifications():
    if os.path.exists(NOTIF_FILE):
        try:
            with open(NOTIF_FILE, "r") as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_notifications(data):
    with open(NOTIF_FILE, "w") as f:
        json.dump(data, f, indent=4)

# --- CONFIGURARE BOT DISCORD ---
TOKEN = os.getenv("DISCORD_TOKEN")
intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents, help_command=None)

# --- CONFIGURĂRI ȘI ID-URI TICKET ---
CATEGORY_ID = 1533357146823987392  # Categoria unde se creează canalele de ticket
TRANSCRIPT_CHANNEL_ID = 1535997796493041694  # Canalul unde se trimit transcripturile

# ID-uri roluri/categorii pentru opțiuni și replace
TICKET_ROLES = {
    "nitro": 1534479829225832528,
    "boost": 1534480275474612254,
    "deco": 1534480089083936789,
    "other": 1535562946107809883,
    "replace": 1534625944017571941
}

@bot.event
async def on_ready():
    try:
        synced = await bot.tree.sync()
        print(f"Sincronizat {len(synced)} comenzi slash.")
    except Exception as e:
        print(f"Eroare sync: {e}")
    print(f'Botul All-in-One este conectat ca: {bot.user}')

# ==========================================
# 1. PARSARE STOC (METODĂ ÎMBUNĂTĂȚITĂ)
# ==========================================
def get_products():
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    }
    res = requests.get("https://dailystore.me/", headers=headers, params={"t": time.time()}, timeout=12)
    if res.status_code != 200:
        raise Exception(f"Site-ul a returnat codul HTTP {res.status_code}")

    soup = BeautifulSoup(res.text, 'html.parser')
    products = []
    seen = set()

    # Căutare generală după elemente care ar putea conține produse (carduri, titluri, prețuri)
    for element in soup.find_all(['div', 'a', 'article', 'span', 'h3', 'h4']):
        text = element.get_text(strip=True)
        
        # Căutăm prețuri de forma $X.XX sau X.XX$ în text
        price_match = re.search(r'\$?(\d+\.\d{2})\b', text)
        if price_match:
            try:
                p_val = float(price_match.group(1))
                if 0.05 < p_val < 500: # Filtrare pentru a fi un preț realist
                    name = text.replace(price_match.group(0), "").strip()
                    if 3 < len(name) < 100 and name not in seen and not any(c in name for c in ["{", "}", "<", ">"]):
                        seen.add(name)
                        p_final = f"${(p_val + 0.10):.2f}"
                        products.append({
                            "name": name,
                            "price": p_final,
                            "description": "Produs disponibil pe DailyStore"
                        })
            except:
                pass

    return products

async def trimite_produse(target, cautare=None):
    try:
        items = get_products()
        if not items:
            await target.send(f"❌ Nu am putut extrage produse de pe site momentan.\n\n🎫 **Vrei să comanzi?** Folosește panoul de tickete!")
            return

        if cautare:
            termeni = cautare.lower().strip().split()
            filtered_items = []
            for p in items:
                p_lower = p["name"].lower()
                if all(t in p_lower for t in termeni):
                    filtered_items.append(p)
            
            items = filtered_items
            if not items:
                await target.send(f"❌ Nu am găsit niciun produs care să corespundă cu **\"{cautare}\"**.")
                return

        items_to_display = items[:10]
        titlu_embed = f"🔍 Căutare stoc: **{cautare}**" if cautare else "🛒 **STOC PRODUSE DISPONIBILE**"

        embed = discord.Embed(
            title=titlu_embed,
            description=f"Am găsit **{len(items)}** produse potrivite.\n\n🎫 Deschide un ticket din panou pentru a comanda!",
            color=0x2b2d31
        )

        for idx, item in enumerate(items_to_display, 1):
            desc_curat = item['description']
            if len(desc_curat) > 100:
                desc_curat = desc_curat[:97] + "..."
                
            valoare_camp = f"💵 **Preț:** `{item['price']}`\n📝 **Descriere:** {desc_curat}"
            embed.add_field(name=f"{idx}. {item['name'][:150]}", value=valoare_camp, inline=False)

        embed.set_footer(text="Toate prețurile includ comisionul de +0.10$")
        await target.send(embed=embed, view=TicketKingPanelView())

    except Exception as err:
        await target.send(f"⚠️ Eroare la preluarea stocului: `{err}`")

@bot.command(name="stock")
async def stock_prefix(ctx, *, cautare: str = None):
    await trimite_produse(ctx, cautare)

@bot.tree.command(name="stock", description="Afișează sau caută un produs în stoc")
async def stock_slash(interaction: discord.Interaction, produs: str = None):
    await interaction.response.defer()
    await trimite_produse(interaction.followup, produs)

# ==========================================
# 2. SISTEM DE TICKETE STIL "TICKET KING"
# ==========================================
class TicketControlView(ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @ui.button(label="🔒 Închide Ticketul", style=discord.ButtonStyle.danger, custom_id="close_ticket_btn")
    async def close_ticket(self, interaction: discord.Interaction, button: ui.Button):
        await interaction.response.send_message("🔒 Ticketul se va închide și se va genera transcriptul...", ephemeral=True)
        
        channel = interaction.channel
        guild = interaction.guild
        transcript_channel = guild.get_channel(TRANSCRIPT_CHANNEL_ID)

        # Generare simplă de transcript din istoricul mesajelor
        messages_text = []
        async for message in channel.history(limit=200, oldest_first=True):
            messages_text.append(f"[{message.created_at.strftime('%Y-%m-%d %H:%M:%S')}] {message.author}: {message.content}")
        
        transcript_content = "\n".join(messages_text)
        file_io = io.BytesIO(transcript_content.encode('utf-8'))
        file = discord.File(file_io, filename=f"transcript-{channel.name}.txt")

        if transcript_channel:
            await transcript_channel.send(f"📁 **Transcript pentru canalul `{channel.name}`** (închis de {interaction.user}):", file=file)

        import asyncio
        await asyncio.sleep(3)
        try:
            await channel.delete()
        except:
            pass

class TicketSelectMenu(ui.Select):
    def __init__(self):
        options = [
            discord.SelectOption(label="N1tr0", value="nitro", emoji="🎁"),
            discord.SelectOption(label="B00st", value="boost", emoji="🚀"),
            discord.SelectOption(label="D3c0", value="deco", emoji="🎨"),
            discord.SelectOption(label="Other", value="other", emoji="🎫"),
            discord.SelectOption(label="Replace", value="replace", emoji="🔄"),
        ]
        super().__init__(placeholder="Select a category below to open a ticket.", options=options)

    async def callback(self, interaction: discord.Interaction):
        guild = interaction.guild
        category = guild.get_channel(CATEGORY_ID)
        
        choice = self.values[0]
        role_id = TICKET_ROLES.get(choice)
        support_role = guild.get_role(role_id) if role_id else None
        replace_role = guild.get_role(TICKET_ROLES["replace"])

        overwrites = {
            guild.default_role: discord.PermissionOverwrite(view_channel=False),
            interaction.user: discord.PermissionOverwrite(view_channel=True, send_messages=True, read_message_history=True),
        }
        
        if support_role:
            overwrites[support_role] = discord.PermissionOverwrite(view_channel=True, send_messages=True, read_message_history=True)
        
        if replace_role and replace_role != support_role:
            overwrites[replace_role] = discord.PermissionOverwrite(view_channel=True, send_messages=True, read_message_history=True)

        channel_kwargs = {
            "name": f"ticket-{choice}-{interaction.user.name}",
            "overwrites": overwrites,
            "topic": f"Ticket {choice} deschis de {interaction.user}"
        }
        if category and isinstance(category, discord.CategoryChannel):
            channel_kwargs["category"] = category

        ticket_channel = await guild.create_text_channel(**channel_kwargs)

        embed = discord.Embed(
            title=f"🎫 Ticket {choice.upper()} - {interaction.user.display_name}",
            description=f"Salut, {interaction.user.mention}!\nUn operator va veni în curând.\n\nCategoria aleasă: **{choice.upper()}**",
            color=0xf1c40f
        )
        embed.set_footer(text="Powered by Ticket King Style")

        mentions = f"{interaction.user.mention}"
        if support_role:
            mentions += f" {support_role.mention}"
        if replace_role and replace_role != support_role:
            mentions += f" {replace_role.mention}"

        await ticket_channel.send(content=mentions, embed=embed, view=TicketControlView())
        await interaction.response.send_message(f"✅ Ticketul tău a fost creat aici: {ticket_channel.mention}", ephemeral=True)

class TicketKingPanelView(ui.View):
    def __init__(self):
        super().__init__(timeout=None)
        self.add_item(TicketSelectMenu())

@bot.command(name="panel")
@commands.has_permissions(administrator=True)
async def panel_prefix(ctx):
    embed = discord.Embed(
        title="VNS Market",
        description="🌙 **Staff offline** — We will respond as soon as possible.\n\nSelect a category below to open a ticket.\n\n*Powered by Ticket King*",
        color=0xf1c40f
    )
    await ctx.send(embed=embed, view=TicketKingPanelView())

@bot.tree.command(name="panel", description="Trimite panoul de tickete stil Ticket King")
@app_commands.checks.has_permissions(administrator=True)
async def panel_slash(interaction: discord.Interaction):
    embed = discord.Embed(
        title="VNS Market",
        description="🌙 **Staff offline** — We will respond as soon as possible.\n\nSelect a category below to open a ticket.\n\n*Powered by Ticket King*",
        color=0xf1c40f
    )
    await interaction.response.send_message("Panou trimis cu succes!", ephemeral=True)
    await interaction.channel.send(embed=embed, view=TicketKingPanelView())

# ==========================================
# 3. CALCULATOR COMISIOANE (!fee)
# ==========================================
def calculate_fee(amount: float):
    pp_fee = (amount + 0.49) / (1 - 0.0349)
    card_fee = (amount + 0.30) / (1 - 0.029)
    return pp_fee, card_fee

@bot.command(name="fee")
async def fee_prefix(ctx, suma: float):
    pp, card = calculate_fee(suma)
    embed = discord.Embed(
        title="🧮 Calculator Comisioane Plată",
        description=f"Pentru a primi **curat ${suma:.2f}**, clientul trebuie să trimită:",
        color=0x2b2d31
    )
    embed.add_field(name="🅿️ PayPal (G&S)", value=f"`${pp:.2f}`", inline=True)
    embed.add_field(name="💳 Card / Stripe", value=f"`${card:.2f}`", inline=True)
    embed.add_field(name="🏛️ Revolut / F&F", value=f"`${suma:.2f}` *(fără comision)*", inline=False)
    await ctx.send(embed=embed)

@bot.tree.command(name="fee", description="Calculează suma exactă cu comisioane")
async def fee_slash(interaction: discord.Interaction, suma: float):
    pp, card = calculate_fee(suma)
    embed = discord.Embed(
        title="🧮 Calculator Comisioane Plată",
        description=f"Pentru a primi **curat ${suma:.2f}**, clientul trebuie să trimită:",
        color=0x2b2d31
    )
    embed.add_field(name="🅿️ PayPal (G&S)", value=f"`${pp:.2f}`", inline=True)
    embed.add_field(name="💳 Card / Stripe", value=f"`${card:.2f}`", inline=True)
    embed.add_field(name="🏛️ Revolut / F&F", value=f"`${suma:.2f}` *(fără comision)*", inline=False)
    await interaction.response.send_message(embed=embed)

# ==========================================
# 4. NOTIFICĂRI RESTOCK (!notify & !restock)
# ==========================================
@bot.command(name="notify")
async def notify_prefix(ctx, *, produs: str):
    produs_key = produs.lower().strip()
    data = load_notifications()
    if produs_key not in data:
        data[produs_key] = []
    if ctx.author.id not in data[produs_key]:
        data[produs_key].append(ctx.author.id)
        save_notifications(data)
        await ctx.send(f"✅ Te-am abonat! Îți voi trimite DM când **\"{produs}\"** reintră în stoc.")
    else:
        await ctx.send(f"ℹ️ Ești deja abonat la notificările pentru **\"{produs}\"**.")

@bot.tree.command(name="notify", description="Abonează-te la notificări DM pentru un produs")
async def notify_slash(interaction: discord.Interaction, produs: str):
    produs_key = produs.lower().strip()
    data = load_notifications()
    if produs_key not in data:
        data[produs_key] = []
    if interaction.user.id not in data[produs_key]:
        data[produs_key].append(interaction.user.id)
        save_notifications(data)
        await interaction.response.send_message(f"✅ Te-am abonat! Îți voi trimite DM când **\"{produs}\"** reintră în stoc.", ephemeral=True)
    else:
        await interaction.response.send_message(f"ℹ️ Ești deja abonat la notificările pentru **\"{produs}\"**.", ephemeral=True)

async def proceseaza_restock(channel, autor, produs, cantitate, detalii):
    embed = discord.Embed(
        title="🚨 **RESTOCK NOU ALIMENTAT!**",
        description=f"Am alimentat stocul pentru **{produs}**!\n\n🎫 Deschide un ticket din panou pentru a comanda!",
        color=0x00ff00
    )
    embed.add_field(name="📦 Cantitate adăugată:", value=f"`{cantitate}`", inline=True)
    if detalii:
        embed.add_field(name="ℹ️ Detalii:", value=detalii, inline=False)
    embed.set_footer(text=f"Restock efectuat de {autor.display_name}")

    await channel.send(content="@everyone", embed=embed, view=TicketKingPanelView())

    data = load_notifications()
    produs_key = produs.lower().strip()
    subscribers = data.get(produs_key, [])
    if subscribers:
        notified_count = 0
        for user_id in list(subscribers):
            try:
                user = await bot.fetch_user(user_id)
                if user:
                    await user.send(f"🔔 **RESTOCK ALERT!** Produsul **{produs}** este acum în stoc ({cantitate} bucăți)!")
                    notified_count += 1
            except:
                pass
        data[produs_key] = []
        save_notifications(data)
        await channel.send(f"📬 *Notificări private trimise către {notified_count} membri abonați!*")

@bot.command(name="restock")
@commands.has_permissions(administrator=True)
async def restock_prefix(ctx, produs: str, cantitate: str, *, detalii: str = None):
    await proceseaza_restock(ctx.channel, ctx.author, produs, cantitate, detalii)

@bot.tree.command(name="restock", description="Anunță un restock nou și trimite DM abonaților")
@app_commands.checks.has_permissions(administrator=True)
async def restock_slash(interaction: discord.Interaction, produs: str, cantitate: str, detalii: str = None):
    await interaction.response.send_message("Restock trimis cu succes!", ephemeral=True)
    await proceseaza_restock(interaction.channel, interaction.user, produs, cantitate, detalii)

# ==========================================
# 5. FLASH DROP (!drop)
# ==========================================
class DropView(ui.View):
    def __init__(self, premiu: str):
        super().__init__(timeout=None)
        self.premiu = premiu
        self.claimed = False

    @ui.button(label="🎁 Revendică Primul!", style=discord.ButtonStyle.success, custom_id="claim_drop_btn_allinone")
    async def claim_button(self, interaction: discord.Interaction, button: ui.Button):
        if self.claimed:
            await interaction.response.send_message("❌ Premiul a fost deja revendicat!", ephemeral=True)
            return
        
        self.claimed = True
        button.disabled = True
        button.label = "❌ Revendicat"
        button.style = discord.ButtonStyle.secondary
        await interaction.message.edit(view=self)
        
        try:
            mesaj_dm = (
                f"🎉 **Felicitări!** Ai câștigat drop-ul:\n\n`{self.premiu}`\n\n"
                f"🎫 **Te rugăm să deschizi un ticket pe server pentru a intra în posesia premiului!**"
            )
            await interaction.user.send(mesaj_dm)
            await interaction.response.send_message(f"🏆 {interaction.user.mention} a câștigat drop-ul! Verifică DM-ul.", ephemeral=False)
        except:
            mesaj_fallback = (
                f"🏆 {interaction.user.mention} a câștigat, dar are DM-ul închis!\n"
                f"🎁 **Premiul:** `{self.premiu}`\n\n"
                f"🎫 **Deschide un ticket pentru a-l revendica!**"
            )
            await interaction.response.send_message(mesaj_fallback, ephemeral=False)

@bot.command(name="drop")
@commands.has_permissions(administrator=True)
async def drop_prefix(ctx, *, premiu: str):
    embed = discord.Embed(
        title="⚡ **FLASH DROP!**",
        description="Apasă primul pe butonul de mai jos pentru a revendica premiul în DM!",
        color=0xffaa00
    )
    await ctx.send(embed=embed, view=DropView(premiu))

@bot.tree.command(name="drop", description="Creează un Flash Drop cu buton")
@app_commands.checks.has_permissions(administrator=True)
async def drop_slash(interaction: discord.Interaction, premiu: str):
    embed = discord.Embed(
        title="⚡ **FLASH DROP!**",
        description="Apasă primul pe butonul de mai jos pentru a revendica premiul în DM!",
        color=0xffaa00
    )
    await interaction.response.send_message(embed=embed, view=DropView(premiu))

# ==========================================
# 6. FAQ (!faq)
# ==========================================
FAQS = {
    "cumpar": ("🛒 Cum Cumpăr?", "1. Folosește panoul de tickete de pe server.\n2. Alege categoria dorită.\n3. Așteaptă un operator."),
    "plata": ("💳 Metode de Plată", "• Revolut / Card\n• PayPal (F&F)\n• Crypto (LTC / USDT)\n• Paysafecard"),
    "garantie": ("🛡️ Garanție", "Garanție valabilă doar cu dovadă video neîntreruptă de la achiziție.")
}

@bot.command(name="faq")
async def faq_prefix(ctx, subiect: str):
    sub = subiect.lower().strip()
    if sub in FAQS:
        titlu, desc = FAQS[sub]
        await ctx.send(embed=discord.Embed(title=titlu, description=desc, color=0x3498db))
    else:
        await ctx.send(f"❌ Subiect necunoscut. Alege: `{', '.join(FAQS.keys())}`")

@bot.tree.command(name="faq", description="Afișează informații FAQ")
async def faq_slash(interaction: discord.Interaction, subiect: str):
    sub = subiect.lower().strip()
    if sub in FAQS:
        titlu, desc = FAQS[sub]
        await interaction.response.send_message(embed=discord.Embed(title=titlu, description=desc, color=0x3498db), ephemeral=True)
    else:
        await interaction.response.send_message(f"❌ Subiect necunoscut. Alege: `{', '.join(FAQS.keys())}`", ephemeral=True)

# ==========================================
# 7. MENIU HELP CUSTOM (!help)
# ==========================================
def creare_embed_help():
    embed = discord.Embed(
        title="🛠️ Meniu Ajutor - Comenzi Bot",
        description="Iată lista completă a comenzilor pe care le poți folosi. \n*Toate funcționează și cu Slash (`/`)*.",
        color=0x2b2d31
    )
    embed.add_field(name="🛒 `!stock [cautare]`", value="Afișează stocul, prețul, descrierea și butonul de ticket.", inline=False)
    embed.add_field(name="🎫 `!panel`", value="*(Admin)* Trimite panoul interactiv de tickete stil Ticket King.", inline=False)
    embed.add_field(name="🧮 `!fee <suma>`", value="Calculează comisioanele pentru PayPal și Card.", inline=False)
    embed.add_field(name="🔔 `!notify <produs>`", value="Te abonezi și primești DM când produsul revine în stoc.", inline=False)
    embed.add_field(name="❓ `!faq <subiect>`", value="Ghid rapid. Subiecte disponibile: `cumpar`, `plata`, `garantie`.", inline=False)
    embed.add_field(name="🚨 `!restock <produs> <cantitate>`", value="*(Admin)* Anunță stoc nou pe chat și dă DM la abonați.", inline=False)
    embed.add_field(name="⚡ `!drop <premiu>`", value="*(Admin)* Face un Drop pe chat cu buton de revendicare.", inline=False)
    embed.set_footer(text="Exemplu: /stock netflix | /fee 15 | !faq plata")
    return embed

@bot.command(name="help")
async def help_prefix(ctx):
    await ctx.send(embed=creare_embed_help())

@bot.tree.command(name="help", description="Afișează lista cu toate comenzile disponibile.")
async def help_slash(interaction: discord.Interaction):
    await interaction.response.send_message(embed=creare_embed_help(), ephemeral=True)

if __name__ == "__main__":
    threading.Thread(target=run_web_server).start()
    bot.run(TOKEN)
