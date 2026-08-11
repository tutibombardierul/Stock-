import os
import io
import re
import requests
import discord
import time
import threading
from discord.ext import commands
from bs4 import BeautifulSoup
from flask import Flask

# --- WEB SERVER PENTRU RENDER ---
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
    await bot.tree.sync()
    print(f'Botul este pornit și conectat ca: {bot.user}')

def get_products():
    url = "https://dailystore.me/"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
    
    try:
        # Preluăm pagina proaspătă de la fiecare comandă
        response = requests.get(url, headers=headers, params={"t": time.time()}, timeout=10)
        soup = BeautifulSoup(response.text, 'html.parser')
        products = []

        # Căutăm containere generice de produse (div-uri, carduri, li-uri)
        candidates = soup.select('div[class*="product"], div[class*="card"], div[class*="item"], a[class*="card"], .card, .product, article')
        
        # Dacă nu găsește cu clase standard, caută toate elementele ce conțin un preț
        if not candidates:
            for elem in soup.find_all(['div', 'article', 'li']):
                if '$' in elem.text and len(elem.text.strip()) < 400:
                    candidates.append(elem)

        seen_names = set()

        for item in candidates:
            text = item.text.lower()

            # --- FILTRARE STOC ---
            if any(x in text for x in ["out of stock", "sold out", "stoc epuizat", "0 in stock", "0 left", "out-of-stock"]):
                continue

            # --- EXTRAGERE PREȚ + ADĂUGARE 0.10$ ---
            price_match = re.search(r'\$\s*(\d+(?:\.\d+)?)', item.text)
            if not price_match:
                price_match = re.search(r'(\d+(?:\.\d+)?)\s*\$', item.text)

            if not price_match:
                continue

            original_val = float(price_match.group(1))
            new_val = original_val + 0.10
            price_str = f"${new_val:.2f}"

            # --- EXTRAGERE TITLU ---
            name = None
            for tag in ['h1', 'h2', 'h3', 'h4', 'h5', 'strong', 'b', 'a']:
                name_elem = item.find(tag)
                if name_elem and len(name_elem.text.strip()) > 1 and '$' not in name_elem.text:
                    name = name_elem.text.strip()
                    break

            if not name:
                lines = [line.strip() for line in item.text.split('\n') if line.strip() and '$' not in line]
                name = lines[0] if lines else "Produs"

            # Evităm duplicatele
            if name in seen_names or len(name) > 80:
                continue
            seen_names.add(name)

            # --- EXTRAGERE IMAGINE ---
            img = item.find('img')
            img_url = None
            if img:
                src = img.get('src') or img.get('data-src')
                if src:
                    if src.startswith('/'):
                        img_url = f"https://dailystore.me{src}"
                    elif src.startswith('http'):
                        img_url = src

            products.append({
                "name": name,
                "price": price_str,
                "img": img_url
            })

        return products[:15] # Afișează maxim primele 15 produse găsite
    except Exception as e:
        print(f"Eroare la preluare produse: {e}")
        return []

async def trimite_produse(target):
    items = get_products()
    if not items:
        await target.send("Momentan nu am găsit niciun produs în stoc pe site.")
        return

    for item in items:
        embed = discord.Embed(
            title=item["name"], 
            description=f"**Preț:** {item['price']}", 
            color=0x00ff00
        )
        # Descărcăm și re-postăm poza pe Discord pentru anonimitate totală
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

# Comanda cu prefix !stock
@bot.command(name="stock")
async def stock_prefix(ctx):
    await ctx.send("🔍 Preluare stoc actualizat...")
    await trimite_produse(ctx)

# Comanda cu slash /stock
@bot.tree.command(name="stock", description="Afișează produsele în stoc")
async def stock_slash(interaction: discord.Interaction):
    await interaction.response.defer()
    await interaction.followup.send("🔍 Preluare stoc actualizat...")
    await trimite_produse(interaction.followup)

# --- LANSARE SERVER WEB ȘI BOT ---
if __name__ == "__main__":
    threading.Thread(target=run_web_server).start()
    bot.run(TOKEN)
                
