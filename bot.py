import os
import io
import re
import json
import requests
import discord
import time
import threading
from discord.ext import commands
from bs4 import BeautifulSoup
from flask import Flask

# --- SERVER WEB PENTRU RENDER (Gratuit 24/7) ---
app = Flask(__name__)
@app.route('/')
def home():
    return "Botul este activ și online!"

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
        print(f"Eroare sync tree: {e}")
    print(f'Botul este pornit și conectat ca: {bot.user}')

def get_products():
    url = "https://dailystore.me/"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
    
    products = []
    try:
        # Interogăm site-ul la secundă fără cache
        response = requests.get(url, headers=headers, params={"t": time.time()}, timeout=12)
        html = response.text
        soup = BeautifulSoup(html, 'html.parser')

        # --- METODA 1: Parsare din datele JSON interne (Next.js / React) ---
        scripts = soup.find_all('script')
        for s in scripts:
            if not s.string:
                continue
            
            # Căutăm blocurile de date JSON
            if '__NEXT_DATA__' in str(s.get('id', '')) or 'props' in s.string or 'products' in s.string:
                try:
                    data = json.loads(s.string)

                    def extract_recursive(obj):
                        if isinstance(obj, dict):
                            # Extragere nume, preț și stoc din dicționar
                            name = obj.get('title') or obj.get('name') or obj.get('label')
                            price = obj.get('price') or obj.get('cost') or obj.get('val') or obj.get('amount')
                            stock = obj.get('stock') if 'stock' in obj else obj.get('quantity')
                            is_out = obj.get('outOfStock') or obj.get('soldOut') or obj.get('isOutOfStock')

                            if name and price is not None and isinstance(name, str) and len(name.strip()) > 1:
                                in_stock = True
                                # Filtrare stoc
                                if stock is not None:
                                    try:
                                        if float(stock) <= 0:
                                            in_stock = False
                                    except:
                                        pass
                                if is_out is True:
                                    in_stock = False

                                if in_stock:
                                    try:
                                        p_val = float(price)
                                        p_final = f"${(p_val + 0.10):.2f}"
                                        
                                        img_url = obj.get('image') or obj.get('img') or obj.get('imageUrl') or obj.get('thumbnail')
                                        if img_url and img_url.startswith('/'):
                                            img_url = f"https://dailystore.me{img_url}"

                                        products.append({
                                            "name": name.strip(),
                                            "price": p_final,
                                            "img": img_url
                                        })
                                    except:
                                        pass

                            for v in obj.values():
                                extract_recursive(v)
                        elif isinstance(obj, list):
                            for item in obj:
                                extract_recursive(item)

                    extract_recursive(data)
                except Exception:
                    pass

        # --- METODA 2: Parsare din HTML (Fallback) ---
        if not products:
            price_nodes = soup.find_all(string=re.compile(r'\$\s*\d+|\d+\s*\$'))
            for node in price_nodes:
                card = node.parent
                for _ in range(3):
                    if card and card.parent and card.parent.name not in ['body', 'html']:
                        card = card.parent

                if not card:
                    continue

                card_text = card.text.lower()
                if any(x in card_text for x in ["out of stock", "sold out", "stoc epuizat", "0 in stock", "0 left"]):
                    continue

                price_match = re.search(r'\$\s*(\d+(?:\.\d+)?)', card.text)
                if price_match:
                    p_val = float(price_match.group(1)) + 0.10
                    
                    name_el = card.find(['h1', 'h2', 'h3', 'h4', 'strong', 'a', 'p'])
                    name = name_el.text.strip() if name_el else None

                    if name and '$' not in name and len(name) < 80:
                        img_el = card.find('img')
                        img_url = img_el.get('src') if img_el else None
                        if img_url and img_url.startswith('/'):
                            img_url = f"https://dailystore.me{img_url}"

                        products.append({
                            "name": name,
                            "price": f"${p_val:.2f}",
                            "img": img_url
                        })

        # Eliminăm duplicatele de nume
        unique_products = []
        seen = set()
        for p in products:
            if p["name"] not in seen and len(p["name"]) > 2:
                seen.add(p["name"])
                unique_products.append(p)

        print(f"DEBUG: S-au extras {len(unique_products)} produse în stoc.")
        return unique_products[:15]

    except Exception as e:
        print(f"Eroare scraping: {e}")
        return []

async def trimite_produse(target):
    items = get_products()
    if not items:
        await target.send("Momentan nu există produse în stoc pe site.")
        return

    for item in items:
        embed = discord.Embed(
            title=item["name"], 
            description=f"**Preț:** {item['price']}", 
            color=0x00ff00
        )
        # Re-încărcare imagine pe CDN-ul Discord pentru anonimizare
        if item["img"]:
            try:
                res = requests.get(item["img"], timeout=5)
                if res.status_code == 200:
                    file = discord.File(io.BytesIO(res.content), filename="produs.jpg")
                    embed.set_image(url="attachment://produs.jpg")
                    await target.send(embed=embed, file=file)
                    continue
            except Exception:
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
                                        
