import os
import io
import re
import json
import time
import urllib.parse
import threading
import requests
import discord
from discord.ext import commands
from bs4 import BeautifulSoup
from flask import Flask

# --- SERVER WEB PENTRU RENDER (Port Fix) ---
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
    print(f'Botul este pornit și conectat ca: {bot.user}')

def get_products():
    target_site = "https://dailystore.me/"
    
    # Folosim Proxy pentru a bypassa blocajul Cloudflare de pe Render
    proxy_url = f"https://api.allorigins.win/raw?url={urllib.parse.quote(target_site)}"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    }

    try:
        response = requests.get(proxy_url, headers=headers, timeout=15)
        
        if response.status_code != 200:
            # Încercăm fallback direct dacă proxy-ul pică
            response = requests.get(target_site, headers=headers, timeout=10)

        html = response.text
        soup = BeautifulSoup(html, 'html.parser')
        products = []
        seen_names = set()

        # 1. Căutăm orice text ce conține un preț cu $
        price_nodes = soup.find_all(string=re.compile(r'\$\s*\d+|\d+\s*\$'))

        for node in price_nodes:
            card = node.parent
            for _ in range(4):
                if card and card.parent and card.parent.name not in ['body', 'html', 'main']:
                    card = card.parent

            if not card:
                continue

            card_text = card.text.lower()

            # --- FILTRARE STOC (Sare peste cele epuizate) ---
            if any(x in card_text for x in ["out of stock", "sold out", "stoc epuizat", "0 in stock", "0 left", "out-of-stock", "0 stoc"]):
                continue

            # --- EXTRAGERE PREȚ + ADĂUGARE 0.10$ ---
            price_match = re.search(r'\$\s*(\d+(?:\.\d+)?)', card.text)
            if not price_match:
                price_match = re.search(r'(\d+(?:\.\d+)?)\s*\$', card.text)

            if not price_match:
                continue

            original_val = float(price_match.group(1))
            new_val = original_val + 0.10
            price_str = f"${new_val:.2f}"

            # --- EXTRAGERE TITLU ---
            name = None
            for tag_name in ['h1', 'h2', 'h3', 'h4', 'h5', 'strong', 'b', 'a', 'p', 'span']:
                for el in card.find_all(tag_name):
                    t = el.text.strip()
                    if 2 < len(t) < 80 and '$' not in t and not any(k in t.lower() for k in ["stock", "buy", "cart", "adauga", "out"]):
                        name = t
                        break
                if name:
                    break

            if not name or name in seen_names:
                continue
            seen_names.add(name)

            # --- EXTRAGERE IMAGINE ---
            img = card.find('img')
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

        return products[:15]

    except Exception as e:
        print(f"Eroare la citire site: {e}")
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
                
