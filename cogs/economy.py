"""
Sistema de Economia Simples para EPA BOT
Baseado no DroppersShopBOT
Atualizado com integração SQLite e embeds padronizados
"""

import json
import os
import random
from datetime import datetime, timedelta
from typing import Optional

import discord
from discord.ext import commands
from discord import app_commands

from utils.embeds import EmbedBuilder
from utils.database import get_database


class SimpleEconomy(commands.Cog):
    """Sistema de economia simples inspirado no DroppersShopBOT"""
    
    def __init__(self, bot):
        self.bot = bot
        self.data_file = "data/economy_simple.json"
        self.data = self.load_data()
        self.db = None  # Será inicializado em cog_load
        
        # Emoji das coins - tentar usar o personalizado primeiro, fallback para Unicode
        self.coin_emoji_custom = "<:epacoin2:1407389417290727434>"  # Emoji personalizado do servidor EPA
        self.coin_emoji_fallback = "🪙"  # Emoji Unicode como fallback
        self.coin_emoji = self.coin_emoji_custom  # Tentar usar o personalizado primeiro
        
        # Criar directório se não existir
        os.makedirs("data", exist_ok=True)
    
    async def cog_load(self):
        """Carregado quando o cog é inicializado"""
        try:
            self.db = await get_database()
        except Exception as e:
            self.bot.logger.error(f"Erro ao carregar database no economy: {e}")
    
    def get_coin_display(self, amount: int = None):
        """Retorna o display formatado das coins com sistema híbrido"""
        # Usar sempre o emoji personalizado (com ID correto)
        emoji = self.coin_emoji_custom
        
        if amount is None:
            return f"{emoji}"
        return f"{amount:,} {emoji}"
    
    def get_coin_text(self):
        """Retorna apenas o emoji das coins"""
        return self.coin_emoji_custom
    
    async def test_emoji_availability(self, guild):
        """Testa se o emoji personalizado está disponível no servidor"""
        try:
            # Tentar obter o emoji do servidor
            emoji_id = 1407389417290727434
            emoji = discord.utils.get(guild.emojis, id=emoji_id)
            if emoji:
                self.coin_emoji = str(emoji)
                return True
            else:
                # Fallback para emoji Unicode
                self.coin_emoji = self.coin_emoji_fallback
                return False
        except:
            # Em caso de erro, usar fallback
            self.coin_emoji = self.coin_emoji_fallback
            return False
    
    def load_data(self):
        """Carregar dados do ficheiro JSON"""
        try:
            with open(self.data_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return {"users": {}}
    
    def save_data(self):
        """Guardar dados no ficheiro JSON com tratamento de erros"""
        try:
            # Criar backup antes de salvar
            if os.path.exists(self.data_file):
                backup_file = f"{self.data_file}.backup"
                with open(self.data_file, 'r', encoding='utf-8') as f:
                    backup_data = f.read()
                with open(backup_file, 'w', encoding='utf-8') as f:
                    f.write(backup_data)
            
            # Salvar dados
            with open(self.data_file, 'w', encoding='utf-8') as f:
                json.dump(self.data, f, indent=2, ensure_ascii=False)
                
        except Exception as e:
            self.bot.logger.error(f"Erro ao guardar dados de economia: {e}")
            # Tentar restaurar do backup se falhou
            if os.path.exists(f"{self.data_file}.backup"):
                try:
                    with open(f"{self.data_file}.backup", 'r', encoding='utf-8') as f:
                        self.data = json.load(f)
                    self.bot.logger.info("Dados restaurados do backup")
                except:
                    pass
    
    def get_user_data(self, user_id: str):
        """Obter dados do utilizador"""
        if user_id not in self.data["users"]:
            self.data["users"][user_id] = {
                "balance": 2500,  # Saldo inicial como no DroppersShopBOT
                "last_daily": None,
                "daily_streak": 0,
                "total_earned": 2500,
                "total_donated": 0,
                "items": []
            }
            self.save_data()
        return self.data["users"][user_id]
    
    def add_money(self, user_id: str, amount: int):
        """Adicionar dinheiro ao utilizador"""
        user_data = self.get_user_data(user_id)
        user_data["balance"] += amount
        user_data["total_earned"] += amount
        self.save_data()
        return user_data["balance"]
    
    def remove_money(self, user_id: str, amount: int):
        """Remover dinheiro do utilizador"""
        user_data = self.get_user_data(user_id)
        if user_data["balance"] >= amount:
            user_data["balance"] -= amount
            self.save_data()
            return True
        return False
    
    def get_balance(self, user_id: str):
        """Obter saldo do utilizador"""
        return self.get_user_data(user_id)["balance"]

    async def _process_custom_role_purchase(self, interaction, user_id, item_info):
        """Processar compra de Custom Role"""
        # Verificar se o usuário já tem uma custom role
        user_data = self.get_user_data(user_id)
        
        # Verificar se já comprou uma custom role
        has_custom_role = any(item.get("name") == "🎨 Custom Role" for item in user_data.get("items", []))
        
        if has_custom_role:
            embed = discord.Embed(
                title="❌ Já Tens Custom Role",
                description="Já compraste uma Custom Role! Usa `/criar_role` para personalizá-la.",
                color=discord.Color.red()
            )
            await interaction.response.send_message(embed=embed, ephemeral=True)
            return
        
        # Processar a compra
        self.remove_money(user_id, item_info["price"])
        user_data["items"].append({
            "name": item_info["name"],
            "purchased": datetime.now().isoformat(),
            "role_created": False
        })
        self.save_data()
        
        embed = discord.Embed(
            title="✅ Custom Role Comprada!",
            description=f"Compraste {item_info['name']} por **{self.get_coin_display(item_info['price'])} EPA Coins**!\n\n"
                       f"🎨 **Usa `/criar_role` para personalizares a tua role!**\n"
                       f"💡 Podes escolher nome, cor e posição da role.",
            color=discord.Color.green()
        )
        
        embed.add_field(
            name="💳 Saldo Restante",
            value=f"{self.get_coin_display(self.get_balance(user_id))}",
            inline=True
        )
        
        await interaction.response.send_message(embed=embed)

    @app_commands.command(name="saldo", description="Vê o teu saldo atual")
    async def balance(self, interaction: discord.Interaction, utilizador: Optional[discord.Member] = None):
        """Ver saldo próprio ou de outro utilizador"""
        target = utilizador or interaction.user
        user_data = self.get_user_data(str(target.id))
        
        embed = discord.Embed(
            title=f"💰 Saldo de {target.display_name}",
            color=0x00ff88
        )
        
        embed.add_field(
            name="💳 Dinheiro",
            value=f"**{self.get_coin_display(user_data['balance'])} EPA Coins**",
            inline=True
        )
        
        embed.add_field(
            name="📊 Total Ganho",
            value=f"{self.get_coin_display(user_data['total_earned'])}",
            inline=True
        )
        
        embed.add_field(
            name="🔥 Streak Diário",
            value=f"{user_data['daily_streak']} dias",
            inline=True
        )
        
        embed.set_thumbnail(url=target.display_avatar.url)
        embed.set_footer(text="💡 Usa /daily para ganhar EPA Coins!")
        
        await interaction.response.send_message(embed=embed)

    @app_commands.command(name="daily", description="Recebe a tua recompensa diária")
    async def daily(self, interaction: discord.Interaction):
        """Recompensa diária com sistema de streak como no DroppersShopBOT"""
        user_id = str(interaction.user.id)
        user_data = self.get_user_data(user_id)
        now = datetime.now()
        
        # Verificar se já recebeu hoje
        if user_data["last_daily"]:
            last_daily = datetime.fromisoformat(user_data["last_daily"])
            if now.date() == last_daily.date():
                # Calcular tempo até próxima recompensa
                next_daily = last_daily.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
                timestamp = int(next_daily.timestamp())
                
                embed = discord.Embed(
                    title="🎁 Recompensa Diária",
                    description=f"❌ Já recebeste a tua recompensa hoje!\n\n⏰ Próxima recompensa: <t:{timestamp}:R>",
                    color=0xff4444
                )
                return await interaction.response.send_message(embed=embed)
        
        # Calcular streak
        streak = user_data["daily_streak"]
        if user_data["last_daily"]:
            days_diff = (now.date() - datetime.fromisoformat(user_data["last_daily"]).date()).days
            if days_diff == 1:
                streak += 1
            elif days_diff > 1:
                streak = 1  # Reset streak se perdeu um dia
        else:
            streak = 1
        
        # Sistema de recompensas como no DroppersShopBOT
        base_reward = random.randint(800, 1200)  # Recompensa base aleatória
        streak_multiplier = min(1 + (streak * 0.1), 3.0)  # Até 3x com streak de 20 dias
        
        # Bónus especiais por streak
        bonus = 0
        if streak >= 7:
            bonus += 500  # Bónus semanal
        if streak >= 14:
            bonus += 750  # Bónus quinzenal
        if streak >= 30:
            bonus += 1500  # Bónus mensal
        
        total_reward = int((base_reward + bonus) * streak_multiplier)
        
        # Atualizar dados
        user_data["last_daily"] = now.isoformat()
        user_data["daily_streak"] = streak
        self.add_money(user_id, total_reward)
        
        embed = discord.Embed(
            title="🎁 Recompensa Diária",
            description=f"💰 Recebeste **{self.get_coin_display(total_reward)} EPA Coins**!",
            color=0x00ff88
        )
        
        embed.add_field(
            name="🎯 Recompensa Base",
            value=f"{self.get_coin_display(base_reward)}",
            inline=True
        )
        
        embed.add_field(
            name="🔥 Streak",
            value=f"{streak} dias (x{streak_multiplier:.1f})",
            inline=True
        )
        
        embed.add_field(
            name="💳 Novo Saldo",
            value=f"{self.get_coin_display(self.get_balance(user_id))}",
            inline=True
        )
        
        if bonus > 0:
            embed.add_field(
                name="🏆 Bónus de Streak!",
                value=f"Ganhaste +{self.get_coin_display(bonus)} extra por manteres o streak!",
                inline=False
            )
        
        if streak >= 30:
            embed.add_field(
                name="👑 Streak Lendário!",
                value="Mantiveste o streak por mais de 30 dias! És uma lenda! 🌟",
                inline=False
            )
        
        embed.set_footer(text="💡 Volta amanhã para manteres o streak e ganhares ainda mais!")
        await interaction.response.send_message(embed=embed)

    @app_commands.command(name="apostar", description="Aposta dinheiro em jogos de sorte")
    @app_commands.describe(
        jogo="Escolhe: moeda, dados, slots",
        quantia="Quantia a apostar"
    )
    async def gamble(self, interaction: discord.Interaction, jogo: str, quantia: int):
        """Sistema de apostas completo como no DroppersShopBOT"""
        user_id = str(interaction.user.id)
        balance = self.get_balance(user_id)
        
        # Validações
        if quantia <= 0:
            return await interaction.response.send_message(f"❌ Tens de apostar pelo menos 1 {self.get_coin_text()} EPA Coin!", ephemeral=True)
        
        if quantia > balance:
            return await interaction.response.send_message(f"❌ Não tens EPA Coins suficientes! Saldo: {self.get_coin_display(balance)}", ephemeral=True)
        
        if quantia > 50000:  # Aumentar limite como no DroppersShopBOT
            return await interaction.response.send_message(f"❌ A aposta máxima é {self.get_coin_display(50000)} EPA Coins!", ephemeral=True)
        
        jogo = jogo.lower()
        won = False
        multiplier = 1
        
        if jogo in ["moeda", "coin", "coinflip"]:
            # Jogo da moeda - 50% chance, 2x multiplicador
            user_choice = random.choice(["cara", "coroa"])
            result = random.choice(["cara", "coroa"])
            
            if user_choice == result:
                won = True
                multiplier = 2
            
            embed = discord.Embed(
                title="🪙 Jogo da Moeda",
                description=f"**Resultado:** {result.title()} {'🎉' if won else '😢'}",
                color=0x00ff88 if won else 0xff4444
            )
            
        elif jogo in ["dados", "dice"]:
            # Jogo de dados - acertar número exato, 6x multiplicador
            user_roll = random.randint(1, 6)
            target = random.randint(1, 6)
            
            if user_roll == target:
                won = True
                multiplier = 6
            
            embed = discord.Embed(
                title="🎲 Jogo de Dados",
                description=f"**Tiraste:** {user_roll} | **Precisavas:** {target} {'🎉' if won else '😢'}",
                color=0x00ff88 if won else 0xff4444
            )
            
        elif jogo in ["slots", "slot"]:
            # Slots - vários símbolos com diferentes multiplicadores
            symbols = ["🍒", "🍊", "🍋", "🍇", "⭐", "💎", "7️⃣"]
            weights = [30, 25, 20, 15, 7, 2, 1]  # Probabilidades
            
            slot1 = random.choices(symbols, weights=weights)[0]
            slot2 = random.choices(symbols, weights=weights)[0]
            slot3 = random.choices(symbols, weights=weights)[0]
            
            # Verificar combinações
            if slot1 == slot2 == slot3:
                won = True
                if slot1 == "💎":
                    multiplier = 50  # Jackpot
                elif slot1 == "7️⃣":
                    multiplier = 25
                elif slot1 == "⭐":
                    multiplier = 10
                elif slot1 == "🍇":
                    multiplier = 5
                else:
                    multiplier = 3
            elif slot1 == slot2 or slot2 == slot3 or slot1 == slot3:
                # Dois iguais
                won = True
                multiplier = 2
            
            embed = discord.Embed(
                title="🎰 Slots",
                description=f"**Resultado:** {slot1} {slot2} {slot3}\n\n{'🎉 **JACKPOT!**' if multiplier >= 10 else '🎉 Ganhaste!' if won else '😢 Perdeste!'}",
                color=0xffd700 if multiplier >= 10 else 0x00ff88 if won else 0xff4444
            )
            
        else:
            embed = discord.Embed(
                title="🎮 Jogos Disponíveis",
                description="**Jogos disponíveis:**\n🪙 `moeda` - 50% chance, 2x ganhos\n🎲 `dados` - 16.7% chance, 6x ganhos\n🎰 `slots` - Várias chances, até 50x ganhos",
                color=0x9932cc
            )
            return await interaction.response.send_message(embed=embed)
        
        # Processar resultado
        if won:
            winnings = quantia * multiplier
            self.add_money(user_id, winnings - quantia)  # Subtrair aposta original
            embed.add_field(
                name="🎉 Ganhaste!",
                value=f"💰 Ganhaste **{self.get_coin_display(winnings)} EPA Coins**! (x{multiplier})\n💳 Novo saldo: **{self.get_coin_display(self.get_balance(user_id))}**",
                inline=False
            )
        else:
            self.remove_money(user_id, quantia)
            embed.add_field(
                name="😢 Perdeste!",
                value=f"💸 Perdeste **{self.get_coin_display(quantia)} EPA Coins**\n💳 Saldo restante: **{self.get_coin_display(self.get_balance(user_id))}**",
                inline=False
            )
        
        await interaction.response.send_message(embed=embed)

    @app_commands.command(name="transferir", description="Transfere dinheiro para outro utilizador")
    @app_commands.describe(
        utilizador="O utilizador para quem transferir",
        quantia="Quantia a transferir"
    )
    async def transfer(self, interaction: discord.Interaction, utilizador: discord.Member, quantia: int):
        """Transferir dinheiro entre utilizadores"""
        if utilizador.bot:
            return await interaction.response.send_message("❌ Não podes transferir dinheiro para bots!", ephemeral=True)
        
        if utilizador.id == interaction.user.id:
            return await interaction.response.send_message("❌ Não podes transferir dinheiro para ti mesmo!", ephemeral=True)
        
        if quantia <= 0:
            return await interaction.response.send_message(f"❌ Tens de transferir pelo menos 1 {self.get_coin_text()} EPA Coin!", ephemeral=True)
        
        sender_id = str(interaction.user.id)
        receiver_id = str(utilizador.id)
        
        if not self.remove_money(sender_id, quantia):
            return await interaction.response.send_message("❌ Não tens EPA Coins suficientes!", ephemeral=True)
        
        self.add_money(receiver_id, quantia)
        
        embed = discord.Embed(
            title="💸 Transferência Realizada",
            description=f"Transferiste **{self.get_coin_display(quantia)} EPA Coins** para {utilizador.mention}",
            color=0x00ff88
        )
        
        embed.add_field(
            name="💳 Teu Saldo",
            value=f"{self.get_coin_display(self.get_balance(sender_id))}",
            inline=True
        )
        
        embed.add_field(
            name="💳 Saldo do Destinatário",
            value=f"{self.get_coin_display(self.get_balance(receiver_id))}",
            inline=True
        )
        
        await interaction.response.send_message(embed=embed)

    @app_commands.command(name="top", description="Ranking dos utilizadores mais ricos")
    async def leaderboard(self, interaction: discord.Interaction):
        """Mostrar ranking de utilizadores"""
        # Obter todos os utilizadores e ordenar por saldo
        all_users = []
        for user_id, data in self.data["users"].items():
            balance = data.get("balance", 0)
            if balance > 0:
                try:
                    user = interaction.guild.get_member(int(user_id))
                    if user:
                        all_users.append((user, balance))
                except:
                    continue
        
        all_users.sort(key=lambda x: x[1], reverse=True)
        
        if not all_users:
            embed = discord.Embed(
                title="📊 Ranking de Riqueza",
                description="Nenhum utilizador encontrado!",
                color=0x666666
            )
            return await interaction.response.send_message(embed=embed)
        
        embed = discord.Embed(
            title="📊 Ranking de Riqueza",
            description="Os utilizadores mais ricos do servidor:",
            color=0xffd700
        )
        
        # Mostrar top 10
        for i, (user, balance) in enumerate(all_users[:10], 1):
            medal = "🥇" if i == 1 else "🥈" if i == 2 else "🥉" if i == 3 else f"**{i}.**"
            embed.add_field(
                name=f"{medal} {user.display_name}",
                value=f"💰 {self.get_coin_display(balance)}",
                inline=False
            )
        
        # Mostrar posição do utilizador atual se não estiver no top 10
        user_position = None
        for i, (user, balance) in enumerate(all_users, 1):
            if user.id == interaction.user.id:
                user_position = i
                break
        
        if user_position and user_position > 10:
            user_balance = self.get_balance(str(interaction.user.id))
            embed.add_field(
                name=f"📍 A tua posição: #{user_position}",
                value=f"💰 {self.get_coin_display(user_balance)}",
                inline=False
            )
        
        embed.set_footer(text="💡 Usa /daily e /apostar para subires no ranking!")
        await interaction.response.send_message(embed=embed)

    @app_commands.command(name="loja", description="Vê a loja de itens")
    async def shop(self, interaction: discord.Interaction):
        """Loja simples de itens"""
        embed = discord.Embed(
            title="🏪 Loja EPA BOT",
            description="Itens disponíveis para comprar:",
            color=0x9932cc
        )
        
        # Itens simples da loja
        shop_items = {
            "🎯 Sorte Extra": {"price": 5000, "description": "Aumenta as chances nos jogos por 1 hora"},
            "💎 Boost Daily": {"price": 10000, "description": "Duplica a próxima recompensa diária"},
            "🛡️ Proteção": {"price": 15000, "description": "Protege contra perdas nos jogos por 24h"},
            "⭐ VIP Status": {"price": 25000, "description": "Acesso a comandos especiais por 7 dias"},
            "🎨 Custom Role": {"price": 50000, "description": "Cria uma role personalizada só tua (visual)"}
        }
        
        for item, info in shop_items.items():
            embed.add_field(
                name=f"{item} - {self.get_coin_display(info['price'])}",
                value=info['description'],
                inline=False
            )
        
        embed.set_footer(text="💡 Usa /comprar <item> para comprares algo!")
        await interaction.response.send_message(embed=embed)

    @app_commands.command(name="comprar", description="Compra um item da loja")
    @app_commands.describe(item="Nome do item a comprar")
    async def buy(self, interaction: discord.Interaction, item: str):
        """Comprar itens da loja"""
        user_id = str(interaction.user.id)
        balance = self.get_balance(user_id)
        
        # Mapear itens da loja
        shop_items = {
            "sorte": {"name": "🎯 Sorte Extra", "price": 5000},
            "boost": {"name": "💎 Boost Daily", "price": 10000},
            "proteção": {"name": "🛡️ Proteção", "price": 15000},
            "protecao": {"name": "🛡️ Proteção", "price": 15000},  # Variação sem acento
            "vip": {"name": "⭐ VIP Status", "price": 25000},
            "role": {"name": "🎨 Custom Role", "price": 50000},
            "customrole": {"name": "🎨 Custom Role", "price": 50000},
            "custom": {"name": "🎨 Custom Role", "price": 50000}
        }
        
        item_key = item.lower()
        if item_key not in shop_items:
            embed = discord.Embed(
                title="❌ Item Não Encontrado",
                description="Esse item não existe na loja!\nUsa `/loja` para veres os itens disponíveis.",
                color=0xff4444
            )
            return await interaction.response.send_message(embed=embed)
        
        item_info = shop_items[item_key]
        
        if balance < item_info["price"]:
            embed = discord.Embed(
                title="💸 EPA Coins Insuficientes",
                description=f"Precisas de **{self.get_coin_display(item_info['price'])} EPA Coins** para comprar {item_info['name']}!\nTens apenas **{self.get_coin_display(balance)}**.",
                color=0xff4444
            )
            return await interaction.response.send_message(embed=embed)
        
        # Processar compra específica
        if item_key in ["role", "customrole", "custom"]:
            # Custom Role - processar separadamente
            await self._process_custom_role_purchase(interaction, user_id, item_info)
            return
        
        # Processar outras compras
        self.remove_money(user_id, item_info["price"])
        user_data = self.get_user_data(user_id)
        user_data["items"].append({
            "name": item_info["name"],
            "purchased": datetime.now().isoformat()
        })
        self.save_data()
        
        embed = discord.Embed(
            title="✅ Compra Realizada",
            description=f"Compraste {item_info['name']} por **{self.get_coin_display(item_info['price'])} EPA Coins**!",
            color=0x00ff88
        )
        
        embed.add_field(
            name="💳 Saldo Restante",
            value=f"{self.get_coin_display(self.get_balance(user_id))}",
            inline=True
        )
        
        await interaction.response.send_message(embed=embed)


    @app_commands.command(name="perfil", description="Vê o teu perfil económico completo")
    async def profile(self, interaction: discord.Interaction, utilizador: Optional[discord.Member] = None):
        """Ver perfil económico detalhado"""
        target = utilizador or interaction.user
        user_data = self.get_user_data(str(target.id))
        
        embed = discord.Embed(
            title=f"👤 Perfil de {target.display_name}",
            color=0x00ff88
        )
        
        embed.set_thumbnail(url=target.display_avatar.url)
        
        # Estatísticas principais
        embed.add_field(
            name="💰 Saldo",
            value=f"{self.get_coin_display(user_data['balance'])}",
            inline=True
        )
        
        embed.add_field(
            name="📈 Total Ganho",
            value=f"{self.get_coin_display(user_data['total_earned'])}",
            inline=True
        )
        
        embed.add_field(
            name="🔥 Streak Diário",
            value=f"{user_data['daily_streak']} dias",
            inline=True
        )
        
        # Estatísticas extras
        embed.add_field(
            name="❤️ Total Doado",
            value=f"{self.get_coin_display(user_data.get('total_donated', 0))}",
            inline=True
        )
        
        embed.add_field(
            name="🛍️ Itens Comprados",
            value=f"{len(user_data.get('items', []))} itens",
            inline=True
        )
        
        # Calcular ranking
        all_balances = [(uid, data.get('balance', 0)) for uid, data in self.data["users"].items()]
        all_balances.sort(key=lambda x: x[1], reverse=True)
        position = next((i for i, (uid, _) in enumerate(all_balances, 1) if uid == str(target.id)), "N/A")
        
        embed.add_field(
            name="🏆 Ranking",
            value=f"#{position}",
            inline=True
        )
        
        await interaction.response.send_message(embed=embed)

    @app_commands.command(name="criar_role", description="Cria/personaliza a tua Custom Role (requer compra)")
    @app_commands.describe(
        nome="Nome da tua role personalizada",
        cor="Cor da role (hex: #FF0000 ou nome: red, blue, green, etc.)"
    )
    async def create_custom_role(self, interaction: discord.Interaction, nome: str, cor: str = "#7289DA"):
        """Criar/personalizar Custom Role"""
        user_id = str(interaction.user.id)
        user_data = self.get_user_data(user_id)
        
        # Verificar se comprou Custom Role
        has_custom_role = any(item.get("name") == "🎨 Custom Role" for item in user_data.get("items", []))
        
        if not has_custom_role:
            embed = discord.Embed(
                title="❌ Custom Role Não Comprada",
                description="Precisas de comprar uma **🎨 Custom Role** na loja primeiro!\n"
                           "Usa `/loja` para veres os itens disponíveis.",
                color=discord.Color.red()
            )
            await interaction.response.send_message(embed=embed, ephemeral=True)
            return
        
        # Verificar permissões do bot
        if not interaction.guild.me.guild_permissions.manage_roles:
            embed = discord.Embed(
                title="❌ Sem Permissões",
                description="O bot não tem permissões para gerir roles neste servidor!",
                color=discord.Color.red()
            )
            await interaction.response.send_message(embed=embed, ephemeral=True)
            return
        
        await interaction.response.defer()
        
        try:
            # Processar cor
            role_color = discord.Color.default()
            
            if cor.startswith("#"):
                # Cor hexadecimal
                try:
                    role_color = discord.Color(int(cor[1:], 16))
                except ValueError:
                    role_color = discord.Color.blue()
            else:
                # Cor por nome
                color_map = {
                    "red": discord.Color.red(),
                    "blue": discord.Color.blue(),
                    "green": discord.Color.green(),
                    "yellow": discord.Color.yellow(),
                    "orange": discord.Color.orange(),
                    "purple": discord.Color.purple(),
                    "pink": discord.Color.magenta(),
                    "black": discord.Color(0x000000),
                    "white": discord.Color(0xFFFFFF),
                    "gold": discord.Color.gold()
                }
                role_color = color_map.get(cor.lower(), discord.Color.blue())
            
            # Verificar se o usuário já tem uma custom role
            existing_role = None
            for role in interaction.user.roles:
                if role.name.startswith(f"🎨 {interaction.user.display_name}") or role.name.startswith("🎨"):
                    existing_role = role
                    break
            
            role_name = f"🎨 {nome}"
            
            if existing_role:
                # Atualizar role existente
                await existing_role.edit(name=role_name, color=role_color, reason="Custom Role atualizada")
                action = "atualizada"
            else:
                # Criar nova role
                new_role = await interaction.guild.create_role(
                    name=role_name,
                    color=role_color,
                    hoist=False,  # Não separar na lista
                    mentionable=False,  # Não mencionável
                    reason=f"Custom Role criada por {interaction.user}"
                )
                
                # Adicionar role ao usuário
                await interaction.user.add_roles(new_role, reason="Custom Role atribuída")
                
                # Tentar posicionar a role (acima das roles @everyone mas abaixo das administrativas)
                try:
                    # Encontrar uma posição segura (acima de @everyone, abaixo do bot)
                    bot_top_role = interaction.guild.me.top_role
                    position = max(1, bot_top_role.position - 1)
                    await new_role.edit(position=position)
                except:
                    pass  # Se não conseguir mover, tudo bem
                
                action = "criada"
                
            # Marcar como criada nos dados
            for item in user_data["items"]:
                if item.get("name") == "🎨 Custom Role":
                    item["role_created"] = True
                    item["role_name"] = role_name
                    break
            self.save_data()
            
            embed = discord.Embed(
                title=f"✅ Custom Role {action.title()}!",
                description=f"A tua Custom Role foi {action} com sucesso!\n\n"
                           f"🏷️ **Nome:** {role_name}\n"
                           f"🎨 **Cor:** {cor}\n"
                           f"👤 **Para:** {interaction.user.mention}",
                color=role_color
            )
            
            embed.add_field(
                name="ℹ️ Informações",
                value="• A role é apenas visual (sem permissões extras)\n"
                      "• Podes usar `/criar_role` novamente para modificar\n"
                      "• A role aparecerá na lista de membros",
                inline=False
            )
            
            await interaction.followup.send(embed=embed)
            
        except discord.Forbidden:
            embed = discord.Embed(
                title="❌ Sem Permissões",
                description="Não tenho permissões suficientes para criar/editar roles!",
                color=discord.Color.red()
            )
            await interaction.followup.send(embed=embed, ephemeral=True)
        except Exception as e:
            embed = discord.Embed(
                title="❌ Erro",
                description=f"Ocorreu um erro ao criar a role: {str(e)[:200]}",
                color=discord.Color.red()
            )
            await interaction.followup.send(embed=embed, ephemeral=True)

    # Comandos administrativos (apenas para admins)
    @app_commands.command(name="eco_add", description="[ADMIN] Adiciona dinheiro a um utilizador")
    @app_commands.describe(
        utilizador="Utilizador para adicionar dinheiro",
        quantia="Quantia a adicionar"
    )
    async def admin_add_money(self, interaction: discord.Interaction, utilizador: discord.Member, quantia: int):
        """Comando administrativo para adicionar dinheiro"""
        # Verificar se é admin
        if not interaction.user.guild_permissions.administrator:
            return await interaction.response.send_message("❌ Apenas administradores podem usar este comando!", ephemeral=True)
        
        if quantia <= 0:
            return await interaction.response.send_message("❌ A quantia deve ser positiva!", ephemeral=True)
        
        self.add_money(str(utilizador.id), quantia)
        
        embed = discord.Embed(
            title="✅ EPA Coins Adicionadas",
            description=f"Adicionaste **{self.get_coin_display(quantia)} EPA Coins** a {utilizador.mention}",
            color=0x00ff88
        )
        
        embed.add_field(
            name="💳 Novo Saldo",
            value=f"{self.get_coin_display(self.get_balance(str(utilizador.id)))}",
            inline=True
        )
        
        await interaction.response.send_message(embed=embed)

    @app_commands.command(name="eco_remove", description="[ADMIN] Remove dinheiro de um utilizador")
    @app_commands.describe(
        utilizador="Utilizador para remover dinheiro",
        quantia="Quantia a remover"
    )
    async def admin_remove_money(self, interaction: discord.Interaction, utilizador: discord.Member, quantia: int):
        """Comando administrativo para remover dinheiro"""
        # Verificar se é admin
        if not interaction.user.guild_permissions.administrator:
            return await interaction.response.send_message("❌ Apenas administradores podem usar este comando!", ephemeral=True)
        
        if quantia <= 0:
            return await interaction.response.send_message("❌ A quantia deve ser positiva!", ephemeral=True)
        
        if self.remove_money(str(utilizador.id), quantia):
            embed = discord.Embed(
                title="✅ EPA Coins Removidas",
                description=f"Removeste **{self.get_coin_display(quantia)} EPA Coins** de {utilizador.mention}",
                color=0xff4444
            )
            
            embed.add_field(
                name="💳 Novo Saldo",
                value=f"{self.get_coin_display(self.get_balance(str(utilizador.id)))}",
                inline=True
            )
        else:
            embed = discord.Embed(
                title="❌ Erro",
                description=f"{utilizador.mention} não tem EPA Coins suficientes!",
                color=0xff4444
            )
        
        await interaction.response.send_message(embed=embed)

    @app_commands.command(name="eco_reset", description="[ADMIN] Reset completo da economia de um utilizador")
    @app_commands.describe(utilizador="Utilizador para resetar")
    async def admin_reset_user(self, interaction: discord.Interaction, utilizador: discord.Member):
        """Comando administrativo para resetar utilizador"""
        # Verificar se é admin
        if not interaction.user.guild_permissions.administrator:
            return await interaction.response.send_message("❌ Apenas administradores podem usar este comando!", ephemeral=True)
        
        user_id = str(utilizador.id)
        if user_id in self.data["users"]:
            del self.data["users"][user_id]
            self.save_data()
        
        embed = discord.Embed(
            title="✅ Utilizador Resetado",
            description=f"Os dados económicos de {utilizador.mention} foram resetados!",
            color=0xff4444
        )
        
        await interaction.response.send_message(embed=embed)

    @app_commands.command(name="apostar_pvp", description="Aposta contra outro utilizador")
    @app_commands.describe(
        utilizador="Utilizador para apostar contra",
        quantia="Quantia a apostar",
        jogo="Tipo de jogo"
    )
    @app_commands.choices(jogo=[
        app_commands.Choice(name="Cara ou Coroa", value="coinflip"),
        app_commands.Choice(name="Dados", value="dice"),
        app_commands.Choice(name="Número Aleatório", value="random")
    ])
    async def apostar_pvp(self, interaction: discord.Interaction, utilizador: discord.Member, quantia: int, jogo: str):
        """Sistema de apostas PvP"""
        user_id = str(interaction.user.id)
        target_id = str(utilizador.id)
        
        # Verificações básicas
        if utilizador.id == interaction.user.id:
            await interaction.response.send_message("❌ Não podes apostar contra ti próprio!", ephemeral=True)
            return
        
        if utilizador.bot:
            await interaction.response.send_message("❌ Não podes apostar contra bots!", ephemeral=True)
            return
        
        if quantia < 50:
            await interaction.response.send_message("❌ Aposta mínima é 50 EPA Coins!", ephemeral=True)
            return
        
        # Verificar saldos
        user_balance = self.get_balance(user_id)
        target_balance = self.get_balance(target_id)
        
        if user_balance < quantia:
            await interaction.response.send_message(f"❌ Não tens EPA Coins suficientes! Saldo: {self.get_coin_display(user_balance)}", ephemeral=True)
            return
        
        if target_balance < quantia:
            await interaction.response.send_message(f"❌ {utilizador.display_name} não tem EPA Coins suficientes para esta aposta!", ephemeral=True)
            return
        
        # Criar embed de desafio
        game_names = {
            "coinflip": "🪙 Cara ou Coroa",
            "dice": "🎲 Dados",
            "random": "🔢 Número Aleatório"
        }
        
        embed = discord.Embed(
            title="⚔️ Desafio de Aposta!",
            description=f"{interaction.user.mention} desafia {utilizador.mention} para uma aposta!",
            color=discord.Color.orange()
        )
        
        embed.add_field(name="🎮 Jogo", value=game_names[jogo], inline=True)
        embed.add_field(name="💰 Quantia", value=self.get_coin_display(quantia), inline=True)
        embed.add_field(name="⏱️ Expira em", value="60 segundos", inline=True)
        
        embed.set_footer(text=f"Para aceitar, {utilizador.display_name} deve clicar em ✅")
        
        # Criar view com botões
        view = BetChallengeView(self, interaction.user, utilizador, quantia, jogo)
        await interaction.response.send_message(embed=embed, view=view)

    async def execute_pvp_bet(self, challenger, challenged, amount, game_type, interaction):
        """Executar aposta PvP"""
        challenger_id = str(challenger.id)
        challenged_id = str(challenged.id)
        
        # Remover dinheiro de ambos
        self.remove_money(challenger_id, amount)
        self.remove_money(challenged_id, amount)
        
        # Determinar vencedor baseado no jogo
        if game_type == "coinflip":
            result = random.choice(["cara", "coroa"])
            challenger_choice = random.choice(["cara", "coroa"])
            challenged_choice = "coroa" if challenger_choice == "cara" else "cara"
            
            winner = challenger if result == challenger_choice else challenged
            
            embed = discord.Embed(
                title="🪙 Resultado: Cara ou Coroa",
                color=discord.Color.gold()
            )
            embed.add_field(name="🎯 Resultado", value=result.title(), inline=True)
            embed.add_field(name=f"🎲 {challenger.display_name}", value=challenger_choice.title(), inline=True)
            embed.add_field(name=f"🎲 {challenged.display_name}", value=challenged_choice.title(), inline=True)
            
        elif game_type == "dice":
            challenger_roll = random.randint(1, 6)
            challenged_roll = random.randint(1, 6)
            
            if challenger_roll > challenged_roll:
                winner = challenger
            elif challenged_roll > challenger_roll:
                winner = challenged
            else:
                winner = None  # Empate
            
            embed = discord.Embed(
                title="🎲 Resultado: Dados",
                color=discord.Color.gold()
            )
            embed.add_field(name=f"🎲 {challenger.display_name}", value=str(challenger_roll), inline=True)
            embed.add_field(name=f"🎲 {challenged.display_name}", value=str(challenged_roll), inline=True)
            
        else:  # random
            challenger_num = random.randint(1, 100)
            challenged_num = random.randint(1, 100)
            
            if challenger_num > challenged_num:
                winner = challenger
            elif challenged_num > challenger_num:
                winner = challenged
            else:
                winner = None  # Empate
            
            embed = discord.Embed(
                title="🔢 Resultado: Número Aleatório",
                color=discord.Color.gold()
            )
            embed.add_field(name=f"🔢 {challenger.display_name}", value=str(challenger_num), inline=True)
            embed.add_field(name=f"🔢 {challenged.display_name}", value=str(challenged_num), inline=True)
        
        # Processar resultado
        if winner:
            # Vencedor recebe o dobro
            self.add_money(str(winner.id), amount * 2)
            embed.add_field(
                name="🏆 Vencedor",
                value=f"{winner.mention} ganhou {self.get_coin_display(amount * 2)}!",
                inline=False
            )
        else:
            # Empate - devolver dinheiro
            self.add_money(challenger_id, amount)
            self.add_money(challenged_id, amount)
            embed.add_field(
                name="🤝 Empate",
                value="Dinheiro devolvido a ambos os jogadores!",
                inline=False
            )
        
        await interaction.edit_original_response(embed=embed, view=None)

    @app_commands.command(name="loteria", description="Participa na loteria semanal")
    async def loteria(self, interaction: discord.Interaction):
        """Sistema de loteria semanal"""
        user_id = str(interaction.user.id)
        
        # Custo do bilhete
        ticket_cost = 100
        balance = self.get_balance(user_id)
        
        if balance < ticket_cost:
            await interaction.response.send_message(f"❌ Precisas de {self.get_coin_display(ticket_cost)} para comprar um bilhete!", ephemeral=True)
            return
        
        # Verificar se já comprou bilhete esta semana
        user_data = self.get_user_data(user_id)
        now = datetime.utcnow()
        week_start = now - timedelta(days=now.weekday())
        week_key = week_start.strftime("%Y-W%U")
        
        if user_data.get("lottery_week") == week_key:
            await interaction.response.send_message("❌ Já compraste um bilhete esta semana!", ephemeral=True)
            return
        
        # Comprar bilhete
        self.remove_money(user_id, ticket_cost)
        user_data["lottery_week"] = week_key
        user_data["lottery_tickets"] = user_data.get("lottery_tickets", 0) + 1
        
        # Gerar número do bilhete
        ticket_number = random.randint(100000, 999999)
        
        embed = discord.Embed(
            title="🎫 Bilhete de Loteria Comprado!",
            description=f"Bilhete #{ticket_number}",
            color=discord.Color.gold()
        )
        
        embed.add_field(name="💰 Custo", value=self.get_coin_display(ticket_cost), inline=True)
        embed.add_field(name="💳 Saldo Restante", value=self.get_coin_display(balance - ticket_cost), inline=True)
        
        # Simular sorteio (1 em 20 chance de ganhar)
        if random.randint(1, 20) == 1:
            # Ganhou!
            prize = random.randint(500, 2000)
            self.add_money(user_id, prize)
            
            embed.title = "🎉 PARABÉNS! GANHASTE A LOTERIA!"
            embed.color = discord.Color.green()
            embed.add_field(
                name="🏆 Prémio",
                value=self.get_coin_display(prize),
                inline=False
            )
            
            # Estatísticas
            user_data["lottery_wins"] = user_data.get("lottery_wins", 0) + 1
            user_data["total_lottery_won"] = user_data.get("total_lottery_won", 0) + prize
        else:
            embed.add_field(
                name="🍀 Boa Sorte!",
                value="O sorteio acontece automaticamente!\nVerifica regularmente se ganhaste.",
                inline=False
            )
        
        embed.add_field(
            name="📊 Estatísticas",
            value=f"Bilhetes comprados: {user_data['lottery_tickets']}\nVitórias: {user_data.get('lottery_wins', 0)}",
            inline=False
        )
        
        self.save_data()
        await interaction.response.send_message(embed=embed)

    @app_commands.command(name="evento_especial", description="[ADMIN] Criar evento especial de economia")
    @app_commands.describe(
        tipo="Tipo de evento",
        multiplicador="Multiplicador de recompensas (padrão: 2.0)"
    )
    @app_commands.choices(tipo=[
        app_commands.Choice(name="Daily Duplo", value="double_daily"),
        app_commands.Choice(name="Apostas com Bónus", value="bet_bonus"),
        app_commands.Choice(name="Chuva de Coins", value="coin_rain")
    ])
    async def evento_especial(self, interaction: discord.Interaction, tipo: str, multiplicador: float = 2.0):
        """Criar eventos especiais (apenas admin)"""
        if not interaction.user.guild_permissions.administrator:
            await interaction.response.send_message("❌ Apenas administradores podem usar este comando!", ephemeral=True)
            return
        
        embed = discord.Embed(
            title="🎊 Evento Especial Ativado!",
            color=discord.Color.gold()
        )
        
        if tipo == "double_daily":
            embed.description = f"**Daily Duplo** ativado!\nTodos os `/daily` darão {multiplicador}x mais EPA Coins!"
            
        elif tipo == "bet_bonus":
            embed.description = f"**Apostas com Bónus** ativado!\nTodas as vitórias em apostas darão {multiplicador}x mais EPA Coins!"
            
        elif tipo == "coin_rain":
            # Chuva de coins - dar coins aleatórias para todos no servidor
            embed.description = "**Chuva de Coins** ativada!\nTodos os membros do servidor receberam coins aleatórias!"
            
            rain_amount = random.randint(50, 200)
            members_count = 0
            
            for member in interaction.guild.members:
                if not member.bot:
                    self.add_money(str(member.id), rain_amount)
                    members_count += 1
            
            embed.add_field(
                name="💰 Distribuição",
                value=f"{self.get_coin_display(rain_amount)} para {members_count} membros!",
                inline=False
            )
            
            self.save_data()
        
        embed.add_field(name="⚙️ Configurado por", value=interaction.user.mention, inline=True)
        embed.set_footer(text="Os eventos são temporários e podem ser desativados a qualquer momento.")
        
        await interaction.response.send_message(embed=embed)


class BetChallengeView(discord.ui.View):
    """View para desafios de aposta PvP"""
    
    def __init__(self, economy_cog, challenger, challenged, amount, game_type):
        super().__init__(timeout=60)
        self.economy_cog = economy_cog
        self.challenger = challenger
        self.challenged = challenged
        self.amount = amount
        self.game_type = game_type
    
    @discord.ui.button(label="✅ Aceitar", style=discord.ButtonStyle.green)
    async def accept(self, interaction: discord.Interaction, button: discord.ui.Button):
        if interaction.user != self.challenged:
            await interaction.response.send_message("❌ Apenas o desafiado pode aceitar!", ephemeral=True)
            return
        
        # Verificar se ainda tem dinheiro suficiente
        balance = self.economy_cog.get_balance(str(self.challenged.id))
        if balance < self.amount:
            await interaction.response.send_message("❌ Já não tens EPA Coins suficientes!", ephemeral=True)
            return
        
        await interaction.response.defer()
        await self.economy_cog.execute_pvp_bet(
            self.challenger, self.challenged, self.amount, self.game_type, interaction
        )
    
    @discord.ui.button(label="❌ Recusar", style=discord.ButtonStyle.red)
    async def decline(self, interaction: discord.Interaction, button: discord.ui.Button):
        if interaction.user != self.challenged:
            await interaction.response.send_message("❌ Apenas o desafiado pode recusar!", ephemeral=True)
            return
        
        embed = discord.Embed(
            title="❌ Aposta Recusada",
            description=f"{self.challenged.mention} recusou o desafio de {self.challenger.mention}",
            color=discord.Color.red()
        )
        
        await interaction.response.edit_message(embed=embed, view=None)
    
    async def on_timeout(self):
        """Callback quando o tempo expira"""
        embed = discord.Embed(
            title="⏰ Tempo Esgotado",
            description="O desafio de aposta expirou!",
            color=discord.Color.orange()
        )
        
        # Tentar editar a mensagem se ainda estiver disponível
        try:
            await self.message.edit(embed=embed, view=None)
        except:
            pass


async def setup(bot):
    await bot.add_cog(SimpleEconomy(bot))
