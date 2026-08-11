import os
import io
import re
import json
import time
import threading
import requests
import cloudscraper
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
    print(f'Botul este online ca: {bot.user}')

def get_products():
    url = "https://dailystore.me/"
    
    try:
        # Folosim cloudscraper pentru a bypassa Cloudflare / protectiile anti-bot
        scraper = cloudscraper.create_scraper(
            browser={'browser': 'chrome', 'platform': 'windows', 'desktop': True}
        )
        response = scraper.get(url, params={"t": time.time()}, timeout=15)
        
        print(f"DEBUG: Status code site = {response.status_code}")
        
        if response.status_code != 200:
            print("DEBUG: Site-ul a blocat cererea.")
            return []

        html = response.text
        soup = BeautifulSoup(html, 'html.parser')
        products = []
        seen_names = set()

        # 1. Încercăm extragere din scripturile JSON ale site-ului
        scripts = soup.find_all('script')
        for s in scripts:
            if not s.string:
                continue
            if any(k in s.string for k in ['props', 'products', 'items', 'state', '__NEXT_DATA__']):
                try:
                    json_matches = re.findall(r'\{.*"title".*\}|\{.*"name".*\}', s.string)
                    for j_str in json_matches:
                        try:
                            data = json.loads(j_str)
                            name = data.get('title') or data.get('name')
                            price = data.get('price') or data.get('cost')
                            stock = data.get('stock', 1)
                            if name and price is not None and stock > 0:
                                p_val = float(price) + 0.10
                                products.append({
                                    "name": str(name).strip(),
                                    "price": f"${p_val:.2f}",
                                    "img": data.get('image') or data.get('thumbnail')
                                })
                        except:
                            pass
                except:
                    pass

        # 2. Extragere din HTML (Fallback)
        if not products:
            cards = soup.select('div, article, section, li, a')
            for card in cards:
                card_text = card.text.lower()
                
                # Verificăm dacă conține preț în format $
                price_match = re.search(r'\$\s*(\d+(?:\.\d+)?)', card.text)
                if not price_match:
                    continue

                # Filtru stoc
                if any(x in card_text for x in ["out of stock", "sold out", "stoc epuizat", "0 in stock", "0 left"]):
                    continue

                # Extragere preț + 0.10$
                orig_price = float(price_match.group(1))
                final_price = f"${(orig_price + 0.10):.2f}"

                # Extragere nume
                lines = [line.strip() for line in card.text.split('\n') if line.strip()]
                name = None
                for line in lines:
                    if 2 < len(line) < 70 and '$' not in line and not any(w in line.lower() for w in ['stock', 'buy', 'cart', 'out']):
                        name = line
                        break

                if not name or name in seen_names:
                    continue

                seen_names.add(name)

                # Extragere imagine
                img_el = card.find('img')
                img_url = None
                if img_el:
                    src = img_el.get('src') or img_el.get('data-src')
                    if src:
                        img_url = f"https://dailystore.me{src}" if src.startswith('/') else src

                products.append({
                    "name": name,
                    "price": final_price,
                    "img": img_url
                })

        # Eliminăm duplicatele
        final_list = []
        seen = set()
        for p in products:
            if p["name"] not in seen and len(p["name"]) > 2:
                seen.add(p["name"])
                final_list.append(p)

        print(f"DEBUG: Am găsit {len(final_list)} produse în stoc.")
        return final_list[:15]

    except Exception as e:
        print(f"Eroare la scraper: {e}")
        return []

async def trimite_produse(target):
    items = get_products()
    if not items:
        await target.send("Momentan nu am găsit produse în stoc pe site.")
        return

    for item in items:
        embed = discord.Embed(
            title=item["name"],
            description=f"**Preț:** {item['price']}",
            color=0x00ff00
        )
        if item["img"]:
            try:
                res = requests.get(item["img"], timeout=5)
                if res.status_code == 200:
                    file = discord.File(io.BytesIO(res.content), filename="produs.jpg")
                    embed.set_image(url="attachment://produs.jpg")
                    await target.send(embed=embed, file=file)
                    continue
            except:
                pass
        await target.send(embed=embed)

@bot.command(name="stock")
async def stock_prefix(ctx):
    await ctx.send("🔍 Preluare stoc actualizat...")
    await trimite_produse(ctx)

@bot.tree.command(name="stock", description="Afișează produsele în stoc")
async def stock_slash(interaction: discord.Interaction):
    await interaction.response.defer()
    await interaction.followup.send("🔍 Preluare stoc actualizat...")
    await trimite_produse(interaction.followup)

if __name__ == "__main__":
    threading.Thread(target=run_web_server).start()
    bot.run(TOKEN)
            
