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

# --- HACK PENTRU RENDER (WEB SERVICE) ---
app = Flask(__name__)
@app.route('/')
def home():
    return "Botul este activ!"

def run_web_server():
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)

# --- CONFIGURARE BOT ---
TOKEN = os.getenv("DISCORD_TOKEN")
intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

@bot.event
async def on_ready():
    await bot.tree.sync()
    print(f'Botul este pornit: {bot.user}')

def parse_price(price_text):
    # Caută un număr zecimal în text
    match = re.search(r'(\d+(?:\.\d+)?)', str(price_text))
    return float(match.group(1)) + 0.10 if match else 0.10

def get_products():
    url = "https://dailystore.me/"
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        response = requests.get(url, headers=headers, params={"t": time.time()}, timeout=10)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # DEBUG: Afișăm în log-urile Render ce conține pagina
        print("DEBUG: Site response length:", len(response.text))
        print("DEBUG: First 500 characters:", soup.get_text()[:500])
        
        products = []
        # Încercăm să găsim orice element care pare a fi un produs
        items = soup.select('.product, .item, [data-product-id], .card')
        print(f"DEBUG: Am găsit {len(items)} elemente de tip produs.")
        
        for item in items:
            # ... restul logicii ramane la fel ...
            
            text = item.text.lower()
            # Filtrare stoc
            if any(x in text for x in ["out of stock", "sold out", "stoc epuizat"]):
                continue
            
            # Nume
            name_elem = item.find(['h2', 'h3', 'a'])
            name = name_elem.text.strip() if name_elem else "Produs"
            
            # Preț (+0.10$)
            price_elem = item.find(string=re.compile(r'\$'))
            raw_price = price_elem if price_elem else "$0.00"
            price = f"${parse_price(raw_price):.2f}"
            
            # Imagine
            img = item.find('img')
            img_url = f"https://dailystore.me{img['src']}" if img and img['src'].startswith('/') else (img['src'] if img else None)
            
            products.append({"name": name, "price": price, "img": img_url})
        return products[:10]
    except Exception as e:
        print(f"Eroare scraping: {e}")
        return []

async def trimite_produse(target):
    items = get_products()
    if not items:
        await target.send("Momentan nu am găsit niciun produs în stoc.")
        return

    for item in items:
        embed = discord.Embed(title=item["name"], description=f"Preț: {item['price']}", color=0x00ff00)
        if item["img"]:
            try:
                res = requests.get(item["img"], timeout=5)
                file = discord.File(io.BytesIO(res.content), "p.jpg")
                embed.set_image(url="attachment://p.jpg")
                await target.send(embed=embed, file=file)
                continue
            except: pass
        await target.send(embed=embed)

@bot.command(name="stock")
async def stock_prefix(ctx):
    await trimite_produse(ctx)

@bot.tree.command(name="stock", description="Afișează produsele în stoc")
async def stock_slash(interaction: discord.Interaction):
    await interaction.response.defer()
    await trimite_produse(interaction.followup)

# --- START BOT + SERVER ---
if __name__ == "__main__":
    threading.Thread(target=run_web_server).start()
    bot.run(TOKEN)
            
