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

# OPRIRE HELP DEFAULT PENTRU A PUTEA PUNE UNUL CUSTOM
bot = commands.Bot(command_prefix="!", intents=intents, help_command=None)

# --- LINK TICKET SETAT MANUAL ---
TICKET_LINK = "https://discord.com/channels/1533357146823987392/1533400621464682546"

@bot.event
async def on_ready():
    try:
        synced = await bot.tree.sync()
        print(f"Sincronizat {len(synced)} comenzi slash.")
    except Exception as e:
        print(f"Eroare sync: {e}")
    print(f'Botul All-in-One este conectat ca: {bot.user}')

# ==========================================
# 1. PARSARE STOC (DAALYSTORE.ME)
# ==========================================
def parse_nextjs_data(html_text):
    soup = BeautifulSoup(html_text, 'html.parser')
    products = []
    found_raw = []

    script_tag = soup.find('script', id='__NEXT_DATA__')
    if script_tag and script_tag.string:
        try:
            data = json.loads(script_tag.string)

            def walk_json(obj):
                if isinstance(obj, dict):
                    name = obj.get('title') or obj.get('name') or obj.get('label')
                    price = obj.get('price') or obj.get('cost') or obj.get('val') or obj.get('minPrice')
                    stock = obj.get('stock') or obj.get('quantity') or obj.get('stock_count')
                    is_out = obj.get('outOfStock', False) or obj.get('soldOut', False)

                    if name and price is not None and isinstance(name, str) and len(name.strip()) > 1:
                        in_stock = True
                        if is_out is True:
                            in_stock = False
                        if stock is not None:
                            try:
                                if float(stock) <= 0:
                                    in_stock = False
                            except:
                                pass

                        if in_stock:
                            found_raw.append((name.strip(), price))

                    for v in obj.values():
                        walk_json(v)
                elif isinstance(obj, list):
                    for item in obj:
                        walk_json(item)

            walk_json(data)
        except Exception as e:
            print(f"Eroare JSON: {e}")

    for name, raw_price in found_raw:
        try:
            if isinstance(raw_price, (int, float)):
                p_num = float(raw_price)
            else:
                match = re.search(r'(\d+(?:\.\d+)?)', str(raw_price))
                p_num = float(match.group(1)) if match else 0.0

            p_final = f"${(p_num + 0.10):.2f}"
            products.append({"name": name, "price": p_final})
        except:
            pass

    if not products:
        raw_matches = re.findall(r'"(?:name|title)":"([^"]+)".*?"price":\s*([\d\.]+)', html_text)
        for name, price in raw_matches:
            if len(name) < 80 and '$' not in name:
                try:
                    p_num = float(price) + 0.10
                    products.append({"name": name, "price": f"${p_num:.2f}"})
                except:
                    pass

    seen = set()
    unique_products = []
    for p in products:
        if p["name"] not in seen and len(p["name"]) > 1:
            if not any(bad in p["name"].lower() for bad in ["select", "choose", "cart", "checkout"]):
                seen.add(p["name"])
                unique_products.append(p)

    return unique_products

def get_products():
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    }
    res = requests.get("https://dailystore.me/", headers=headers, params={"t": time.time()}, timeout=12)
    if res.status_code == 200:
        return parse_nextjs_data(res.text)
    else:
        raise Exception(f"Site-ul a returnat codul HTTP {res.status_code}")

async def trimite_produse(target, cautare=None):
    try:
        items = get_products()
        if not items:
            await target.send(f"❌ Nu am găsit niciun produs pe stoc momentan.\n\n🎫 **Vrei să plasezi o comandă sau să pui o întrebare?**\nDeschide un ticket aici: {TICKET_LINK}")
            return

        if cautare:
            termen = cautare.lower().strip()
            items = [p for p in items if termen in p["name"].lower()]
            if not items:
                await target.send(f"❌ Produsul **\"{cautare}\"** nu a fost găsit în stoc.\n\n🎫 **Vrei să întrebi de stoc sau să precomanzi?**\nDeschide un ticket aici: {TICKET_LINK}")
                return

        items_to_display = items[:15]
        titlu_embed = f"🔍 Căutare stoc: **{cautare}**" if cautare else "🛒 **STOC PRODUSE DISPONIBILE**"

        embed = discord.Embed(
            title=titlu_embed,
            description=f"Am găsit **{len(items)}** produse.\n\n🎫 **CUM CUMPĂR?**\n[Deschide un ticket apăsând AICI]({TICKET_LINK}) și scrie-ne ce vrei să comanzi!\n\n",
            color=0x2b2d31
        )

        for idx, item in enumerate(items_to_display, 1):
            embed.add_field(
                name=f"{idx}. {item['name'][:150]}",
                value=f"💵 **Preț:** `{item['price']}`",
                inline=False
            )

        embed.set_footer(text="Toate prețurile includ comisionul de +0.10$")
        await target.send(embed=embed)

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
# 2. CALCULATOR COMISIOANE (!fee)
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
# 3. NOTIFICĂRI RESTOCK (!notify & !restock)
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
        description=f"Am alimentat stocul pentru **{produs}**!\n\n🎫 **Comandă acum prin ticket:**\n{TICKET_LINK}",
        color=0x00ff00
    )
    embed.add_field(name="📦 Cantitate adăugată:", value=f"`{cantitate}`", inline=True)
    if detalii:
        embed.add_field(name="ℹ️ Detalii:", value=detalii, inline=False)
    embed.set_footer(text=f"Restock efectuat de {autor.display_name}")

    await channel.send(content="@everyone", embed=embed)

    data = load_notifications()
    produs_key = produs.lower().strip()
    subscribers = data.get(produs_key, [])
    if subscribers:
        notified_count = 0
        for user_id in list(subscribers):
            try:
                user = await bot.fetch_user(user_id)
                if user:
                    await user.send(f"🔔 **RESTOCK ALERT!** Produsul **{produs}** este acum în stoc ({cantitate} bucăți)!\n🎫 Cumpără aici: {TICKET_LINK}")
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
# 4. FLASH DROP (!drop)
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
            # Mesajul care ajunge în DM-ul câștigătorului cu instrucțiunea de ticket:
            mesaj_dm = (
                f"🎉 **Felicitări!** Ai câștigat drop-ul:\n\n`{self.premiu}`\n\n"
                f"🎫 **Pentru a intra în posesia premiului, te rog să deschizi un ticket aici:**\n{TICKET_LINK}"
            )
            await interaction.user.send(mesaj_dm)
            await interaction.response.send_message(f"🏆 {interaction.user.mention} a câștigat drop-ul! Verifică DM-ul.", ephemeral=False)
        except:
            # Dacă are DM închis, îl anunțăm pe chat să facă ticket:
            mesaj_fallback = (
                f"🏆 {interaction.user.mention} a câștigat, dar are DM-ul închis!\n"
                f"🎁 **Premiul:** `{self.premiu}`\n\n"
                f"🎫 **Deschide un ticket pentru a-l primi:** {TICKET_LINK}"
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
# 5. FAQ (!faq)
# ==========================================
FAQS = {
    "cumpar": ("🛒 Cum Cumpăr?", f"1. Deschide un ticket aici: {TICKET_LINK}\n2. Specifică produsul dorit.\n3. Așteaptă un operator."),
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
# 6. MENIU HELP CUSTOM (!help)
# ==========================================
def creare_embed_help():
    embed = discord.Embed(
        title="🛠️ Meniu Ajutor - Comenzi Bot",
        description="Iată lista completă a comenzilor pe care le poți folosi. \n*Toate funcționează și cu Slash (`/`)*.",
        color=0x2b2d31
    )
    
    # Comenzi pentru Clienți
    embed.add_field(name="🛒 `!stock [cautare]`", value="Afișează stocul sau caută un produs specific.", inline=False)
    embed.add_field(name="🧮 `!fee <suma>`", value="Calculează comisioanele pentru PayPal și Card.", inline=False)
    embed.add_field(name="🔔 `!notify <produs>`", value="Te abonezi și primești DM când produsul revine în stoc.", inline=False)
    embed.add_field(name="❓ `!faq <subiect>`", value="Ghid rapid. Subiecte disponibile: `cumpar`, `plata`, `garantie`.", inline=False)
    
    # Comenzi pentru Admini
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
                    
