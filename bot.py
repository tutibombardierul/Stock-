import os
import io
import re
import json
import time
import threading
import requests
import discord
from discord.ext import commands
from bs4 import BeautifulSoup
from flask import Flask

# --- SERVER WEB PENTRU RENDER ---
app = Flask(__name__)
@app.route('/')
def home():
    return "Botul este activ!"

def run_web_server():
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)

# --- CONFIGURARE BOT DISCORD ---
TOKEN = os.getenv("DISCORD_TOKEN")
intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

@bot.event
async def on_ready():
    try:
        await bot.tree.sync()
    except Exception as e:
        print(f"Eroare sync: {e}")
    print(f'Botul este conectat ca: {bot.user}')

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

    # Fallback Regex dacă scriptul nu s-a putut parsa
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
    try:
        res = requests.get("https://dailystore.me/", headers=headers, params={"t": time.time()}, timeout=12)
        if res.status_code == 200:
            return parse_nextjs_data(res.text)
    except Exception as e:
        print(f"Eroare fetch: {e}")
    return []

# --- TRIMITERE SECURIZATĂ ÎNTR-UN SINGUR MESAJ ---
async def trimite_produse(target):
    try:
        items = get_products()
        if not items:
            await target.send("Momentan nu există produse în stoc pe site.")
            return

        # Protecție la limita Discord (maxim 15 produse per Embed)
        items_to_display = items[:15]

        embed = discord.Embed(
            title="🛒 **STOC PRODUSE DISPONIBILE**",
            description=f"Am găsit **{len(items)}** produse în stoc (afișez primele {len(items_to_display)}):\n\n",
            color=0x2b2d31
        )

        for idx, item in enumerate(items_to_display, 1):
            title_clean = item['name'][:200]  # Tăiem la max 200 char să nu depășească limita
            embed.add_field(
                name=f"{idx}. {title_clean}",
                value=f"💵 **Preț:** `{item['price']}`",
                inline=False
            )

        embed.set_footer(text="Toate prețurile includ comisionul de +0.10$")
        await target.send(embed=embed)

    except Exception as err:
        # Trimite eroarea direct în canal în loc să tacă botul
        await target.send(f"⚠️ Eroare la generarea mesajului: `{err}`")

@bot.command(name="stock")
async def stock_prefix(ctx):
    await ctx.send("🔍 Preluare stoc actualizat...")
    await trimite_produse(ctx)

@bot.tree.command(name="stock", description="Afișează produsele în stoc")
async def stock_slash(interaction: discord.Interaction):
    await interaction.response.defer()
    await interaction.followup.send("🔍 Preluare stoc actualizat...")
    await trimite_produse(interaction.followup)

@bot.command(name="debug")
async def debug_cmd(ctx):
    try:
        res = requests.get("https://dailystore.me/", headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
        await ctx.send(f"**Status HTTP:** `{res.status_code}` | **Lungime:** `{len(res.text)} char`")
    except Exception as e:
        await ctx.send(f"Eroare: `{e}`")

if __name__ == "__main__":
    threading.Thread(target=run_web_server).start()
    bot.run(TOKEN)
    
