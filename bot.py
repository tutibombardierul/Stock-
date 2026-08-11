import os
import io
import re
import requests
import discord
from discord.ext import commands
from bs4 import BeautifulSoup

TOKEN = os.getenv("DISCORD_TOKEN")
intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

@bot.event
async def on_ready():
    await bot.tree.sync()
    print(f'Botul a pornit: {bot.user}')

def parse_price(price_text):
    match = re.search(r'(\d+(?:\.\d+)?)', str(price_text))
    return float(match.group(1)) + 0.10 if match else 0.10

def get_products():
    url = "https://dailystore.me/"
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        response = requests.get(url, headers=headers, timeout=10)
        soup = BeautifulSoup(response.text, 'html.parser')
        products = []
        # Căutăm elementele de produse (clase generice de card)
        items = soup.select('.product, .item, [data-product-id]')
        for item in items:
            text = item.text.lower()
            if "out of stock" in text or "sold out" in text: continue
            
            name = item.find(['h2', 'h3', 'a']).text.strip() if item.find(['h2', 'h3', 'a']) else "Produs"
            price_elem = item.find(string=re.compile(r'\$'))
            raw_price = price_elem if price_elem else "$0.00"
            price = f"${parse_price(raw_price):.2f}"
            
            img = item.find('img')
            img_url = f"https://dailystore.me{img['src']}" if img and img['src'].startswith('/') else (img['src'] if img else None)
            
            products.append({"name": name, "price": price, "img": img_url})
        return products[:10] # Doar primele 10
    except: return []

async def trimite(channel):
    items = get_products()
    if not items: await channel.send("Nu am găsit produse în stoc.")
    for item in items:
        embed = discord.Embed(title=item["name"], description=f"Preț: {item['price']}", color=0x00ff00)
        if item["img"]:
            try:
                res = requests.get(item["img"], timeout=5)
                file = discord.File(io.BytesIO(res.content), "p.jpg")
                embed.set_image(url="attachment://p.jpg")
                await channel.send(embed=embed, file=file)
                continue
            except: pass
        await channel.send(embed=embed)

@bot.command(name="stock")
async def stock_prefix(ctx):
    await trimite(ctx)

@bot.tree.command(name="stock", description="Arată stocul")
async def stock_slash(interaction: discord.Interaction):
    await interaction.response.defer()
    await trimite(interaction.followup)

bot.run(TOKEN)
          
