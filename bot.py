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

# --- WEB SERVER PENTRU RENDER (Gratuit 24/7) ---
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

def fetch_site_data():
    """Încearcă să extragă datele prin API-uri interne sau JSON embedded."""
    session = requests.Session()
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://dailystore.me/"
    }

    # 1. Încercăm endpoint-uri uzuale de API pe care le folosesc magazinele de genul ăsta
    api_endpoints = [
        "https://dailystore.me/api/products",
        "https://dailystore.me/api/v1/products",
        "https://dailystore.me/api/stock",
        "https://dailystore.me/_next/data/"
    ]

    products = []

    # Încercare API direct
    for api_url in api_endpoints[:3]:
        try:
            res = session.get(api_url, headers=headers, timeout=5)
            if res.status_code == 200:
                data = res.json()
                items = data if isinstance(data, list) else data.get('products', data.get('items', []))
                for item in items:
                    name = item.get('name') or item.get('title')
                    price = item.get('price') or item.get('cost')
                    stock = item.get('stock', 1)
                    if name and price is not None and stock > 0:
                        p_val = float(price) + 0.10
                        products.append({
                            "name": str(name),
                            "price": f"${p_val:.2f}",
                            "img": item.get('image') or item.get('thumbnail')
                        })
                if products:
                    return products
        except:
            pass

    # 2. Fallback: Citire din sursa paginii principale
    try:
        res = session.get("https://dailystore.me/", headers={"User-Agent": headers["User-Agent"]}, timeout=10)
        soup = BeautifulSoup(res.text, 'html.parser')

        # Căutăm orice bloc JSON de stare (ex. __NEXT_DATA__)
        scripts = soup.find_all('script')
        for s in scripts:
            if s.string and ('props' in s.string or 'products' in s.string or 'pageProps' in s.string):
                try:
                    # Extragem structura JSON din script
                    match = re.search(r'\{.*\}', s.string)
                    if match:
                        json_data = json.loads(match.group(0))
                        
                        def parse_json(obj):
                            if isinstance(obj, dict):
                                title = obj.get('name') or obj.get('title')
                                price = obj.get('price') or obj.get('cost')
                                in_stock = obj.get('inStock', True)
                                stock_qty = obj.get('stock', 1)

                                if title and price is not None and isinstance(title, str) and len(title) > 1:
                                    try:
                                        if float(stock_qty) > 0 and in_stock is not False:
                                            p_val = float(price) + 0.10
                                            products.append({
                                                "name": title.strip(),
                                                "price": f"${p_val:.2f}",
                                                "img": obj.get('image') or obj.get('img')
                                            })
                                    except:
                                        pass
                                for v in obj.values():
                                    parse_json(v)
                            elif isinstance(obj, list):
                                for elem in obj:
                                    parse_json(elem)

                        parse_json(json_data)
                except:
                    pass
    except Exception as e:
        print(f"Eroare fallback: {e}")

    # Eliminăm duplicatele
    seen = set()
    final_p = []
    for p in products:
        if p["name"] not in seen:
            seen.add(p["name"])
            final_p.append(p)

    return final_p[:15]

async def trimite_produse(target):
    items = fetch_site_data()
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
                if item["img"].startswith('/'):
                    item["img"] = f"https://dailystore.me{item['img']}"
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

# --- COMANDĂ DE DIAGNOSTIC DIREKT PE DISCORD ---
@bot.command(name="debug")
async def debug_cmd(ctx):
    try:
        res = requests.get("https://dailystore.me/", headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
        preview = res.text[:300].replace('\n', ' ')
        await ctx.send(f"**Status HTTP:** `{res.status_code}`\n**Lungime răspuns:** `{len(res.text)} caractere`\n**Sursă (primele 300 char):** ```html\n{preview}\n```")
    except Exception as e:
        await ctx.send(f"Eroare la conectare: `{e}`")

if __name__ == "__main__":
    threading.Thread(target=run_web_server).start()
    bot.run(TOKEN)
                            
