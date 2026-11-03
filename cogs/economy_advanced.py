"""
Sistema de Economia Avançado para EPA BOT
Funcionalidades: Custom Roles, Trading, Achievements, Leilões, Eventos
"""

import json
import discord
from discord import app_commands
from discord.ext import commands
from datetime import datetime, timedelta
from typing import Optional
import random

from utils.embeds import EmbedBuilder
from utils.database import get_database


class EconomyAdvanced(commands.Cog):
    """Sistema de economia avançado com features premium"""
    
    def __init__(self, bot):
        self.bot = bot
        self.db = None
        self.coin_emoji = "<:epacoin2:1407389417290727434>"
        
        # Raridades de itens com cores
        self.rarities = {
            "common": {"name": "Comum", "color": 0x95a5a6, "emoji": "⚪"},
            "uncommon": {"name": "Incomum", "color": 0x2ecc71, "emoji": "🟢"},
            "rare": {"name": "Raro", "color": 0x3498db, "emoji": "🔵"},
            "epic": {"name": "Épico", "color": 0x9b59b6, "emoji": "🟣"},
            "legendary": {"name": "Lendário", "color": 0xf39c12, "emoji": "🟠"},
            "mythic": {"name": "Mítico", "color": 0xe74c3c, "emoji": "🔴"}
        }
    
    async def cog_load(self):
        """Carregado quando o cog é inicializado"""
        try:
            self.db = await get_database()
        except Exception as e:
            self.bot.logger.error(f"Erro ao carregar economy_advanced: {e}")
    
    def get_coin_display(self, amount: int = None):
        """Retorna display formatado das coins"""
        if amount is None:
            return self.coin_emoji
        return f"{amount:,} {self.coin_emoji}"

    def _validate_role_name(self, role_name: str) -> str:
        cleaned_name = role_name.strip()
        if not cleaned_name:
            raise ValueError("❌ O nome da role não pode estar vazio!")
        if len(cleaned_name) > 32:
            raise ValueError("❌ Nome da role deve ter no máximo 32 caracteres!")

        lowered_name = cleaned_name.lower()
        if "@everyone" in lowered_name or "@here" in lowered_name:
            raise ValueError("❌ O nome da role não pode mencionar @everyone ou @here!")

        return cleaned_name

    def _parse_role_color(self, raw_color: str) -> discord.Color:
        color_names = {
            "red": 0xff0000, "blue": 0x0000ff, "green": 0x00ff00,
            "yellow": 0xffff00, "purple": 0x800080, "pink": 0xffc0cb,
            "orange": 0xffa500, "black": 0x000000, "white": 0xffffff,
            "cyan": 0x00ffff, "magenta": 0xff00ff, "gold": 0xffd700
        }

        normalized = raw_color.strip()
        if normalized.lower() in color_names:
            return discord.Color(color_names[normalized.lower()])

        color_hex = normalized[1:] if normalized.startswith("#") else normalized
        if len(color_hex) != 6 or any(char not in "0123456789abcdefABCDEF" for char in color_hex):
            raise ValueError("❌ Cor inválida! Use formato hex (#FF5733) ou nome (red, blue, etc.)")

        return discord.Color(int(color_hex, 16))
    
    # ===== CUSTOM ROLES =====
    
    @app_commands.command(name="comprar_role", description="Compra uma custom role personalizada (50,000 coins)")
    @app_commands.describe(
        nome="Nome da role (máx 32 caracteres)",
        cor="Cor em hexadecimal (ex: #FF5733) ou nome (red, blue, green, etc.)"
    )
    async def buy_custom_role(self, interaction: discord.Interaction, nome: str, cor: str = "#7289DA"):
        """Compra e cria uma custom role"""
        await interaction.response.defer()
        
        user_id = str(interaction.user.id)
        guild_id = str(interaction.guild.id)
        
        # Verificar se já tem custom role
        existing_role = await self.db.get_custom_role(user_id, guild_id)
        if existing_role:
            embed = discord.Embed(
                title="❌ Já Tens Uma Custom Role",
                description=f"Já tens a role **{existing_role['role_name']}**!\nUsa `/editar_role` para modificá-la ou `/remover_role` para removê-la.",
                color=0xff4444
            )
            return await interaction.followup.send(embed=embed)
        
        # Verificar saldo (assumindo que existe get_balance em economy.py)
        from cogs.economy import SimpleEconomy
        economy_cog = self.bot.get_cog("SimpleEconomy")
        if not economy_cog:
            return await interaction.followup.send("❌ Sistema de economia não disponível!")
        
        balance = economy_cog.get_balance(user_id)
        price = 50000
        
        if balance < price:
            embed = discord.Embed(
                title="💸 EPA Coins Insuficientes",
                description=f"Precisas de **{self.get_coin_display(price)}** para comprar uma Custom Role!\nTens apenas **{self.get_coin_display(balance)}**.",
                color=0xff4444
            )
            return await interaction.followup.send(embed=embed)
        
        try:
            nome = self._validate_role_name(nome)
            color_value = self._parse_role_color(cor)
        except ValueError as error:
            return await interaction.followup.send(str(error))
        
        try:
            # Criar role no Discord
            role = await interaction.guild.create_role(
                name=nome,
                color=color_value,
                reason=f"Custom Role comprada por {interaction.user}"
            )
            
            # Posicionar role logo abaixo do bot
            bot_role = interaction.guild.me.top_role
            positions = {role: bot_role.position - 1}
            await interaction.guild.edit_role_positions(positions=positions)
            
            # Adicionar role ao utilizador
            await interaction.user.add_roles(role)
            
            # Guardar na base de dados
            await self.db.create_custom_role(
                user_id=user_id,
                guild_id=guild_id,
                role_id=str(role.id),
                role_name=nome,
                role_color=str(color_value)
            )
            
            # Deduzir coins
            economy_cog.remove_money(user_id, price)
            
            embed = discord.Embed(
                title="✅ Custom Role Criada!",
                description=f"**{nome}** foi criada e atribuída!",
                color=color_value
            )
            embed.add_field(name="💰 Custo", value=self.get_coin_display(price), inline=True)
            embed.add_field(name="💳 Saldo Restante", value=self.get_coin_display(economy_cog.get_balance(user_id)), inline=True)
            embed.add_field(name="🎨 Cor", value=str(color_value), inline=True)
            embed.set_footer(text="Usa /editar_role para mudar nome ou cor!")
            
            await interaction.followup.send(embed=embed)
            
        except discord.Forbidden:
            await interaction.followup.send("❌ Não tenho permissões para criar roles!")
        except Exception as e:
            await interaction.followup.send(f"❌ Erro ao criar role: {e}")
    
    @app_commands.command(name="editar_role", description="Edita a tua custom role (grátis)")
    @app_commands.describe(
        novo_nome="Novo nome (deixa vazio para manter)",
        nova_cor="Nova cor (deixa vazio para manter)"
    )
    async def edit_custom_role(self, interaction: discord.Interaction, novo_nome: Optional[str] = None, nova_cor: Optional[str] = None):
        """Edita custom role existente"""
        await interaction.response.defer()
        
        user_id = str(interaction.user.id)
        guild_id = str(interaction.guild.id)
        
        # Verificar se tem custom role
        custom_role_data = await self.db.get_custom_role(user_id, guild_id)
        if not custom_role_data:
            return await interaction.followup.send("❌ Não tens uma Custom Role! Compra uma com `/comprar_role`")
        
        # Obter role do Discord
        role = interaction.guild.get_role(int(custom_role_data['role_id']))
        if not role:
            await self.db.delete_custom_role(user_id, guild_id)
            return await interaction.followup.send("❌ A tua Custom Role foi removida. Compra uma nova com `/comprar_role`")
        
        # Atualizar nome
        if novo_nome:
            try:
                novo_nome = self._validate_role_name(novo_nome)
            except ValueError as error:
                return await interaction.followup.send(str(error))
            await role.edit(name=novo_nome)
        
        # Atualizar cor
        new_color = None
        if nova_cor:
            try:
                new_color = self._parse_role_color(nova_cor)
                await role.edit(color=new_color)
            except ValueError as error:
                return await interaction.followup.send(str(error))
        
        # Atualizar base de dados
        await self.db.create_custom_role(
            user_id=user_id,
            guild_id=guild_id,
            role_id=str(role.id),
            role_name=novo_nome or role.name,
            role_color=str(new_color or role.color)
        )
        
        embed = discord.Embed(
            title="✅ Custom Role Atualizada!",
            description=f"**{role.name}** foi atualizada!",
            color=new_color or role.color
        )
        if novo_nome:
            embed.add_field(name="📝 Novo Nome", value=novo_nome, inline=True)
        if nova_cor:
            embed.add_field(name="🎨 Nova Cor", value=str(new_color), inline=True)
        
        await interaction.followup.send(embed=embed)
    
    @app_commands.command(name="remover_role", description="Remove a tua custom role permanentemente")
    async def remove_custom_role(self, interaction: discord.Interaction):
        """Remove custom role"""
        await interaction.response.defer()
        
        user_id = str(interaction.user.id)
        guild_id = str(interaction.guild.id)
        
        # Verificar se tem custom role
        custom_role_data = await self.db.get_custom_role(user_id, guild_id)
        if not custom_role_data:
            return await interaction.followup.send("❌ Não tens uma Custom Role!")
        
        # Obter role do Discord
        role = interaction.guild.get_role(int(custom_role_data['role_id']))
        if role:
            try:
                await role.delete(reason=f"Custom role removida por {interaction.user}")
            except discord.HTTPException as error:
                self.bot.logger.debug(f"Falha ao apagar custom role {role.id}: {error}")
        
        # Remover da base de dados
        await self.db.delete_custom_role(user_id, guild_id)
        
        embed = discord.Embed(
            title="✅ Custom Role Removida",
            description="A tua Custom Role foi removida permanentemente.",
            color=0x00ff88
        )
        embed.set_footer(text="Podes comprar uma nova com /comprar_role")
        
        await interaction.followup.send(embed=embed)
    
    # ===== TRADING SYSTEM =====
    
    @app_commands.command(name="propor_trade", description="Propõe uma troca com outro utilizador")
    @app_commands.describe(
        utilizador="Utilizador com quem queres trocar",
        tuas_coins="Quantidade de coins que ofereces",
        pedes_coins="Quantidade de coins que pedes"
    )
    async def propose_trade(self, interaction: discord.Interaction, utilizador: discord.Member, tuas_coins: int = 0, pedes_coins: int = 0):
        """Propor trade entre utilizadores"""
        await interaction.response.defer()
        
        if utilizador.bot:
            return await interaction.followup.send("❌ Não podes fazer trades com bots!")
        
        if utilizador == interaction.user:
            return await interaction.followup.send("❌ Não podes fazer trade contigo mesmo!")
        
        if tuas_coins < 0 or pedes_coins < 0:
            return await interaction.followup.send("❌ Valores devem ser positivos!")
        
        if tuas_coins == 0 and pedes_coins == 0:
            return await interaction.followup.send("❌ Trade deve incluir pelo menos algo!")
        
        # Verificar saldo do sender
        from cogs.economy import SimpleEconomy
        economy_cog = self.bot.get_cog("SimpleEconomy")
        sender_balance = economy_cog.get_balance(str(interaction.user.id))
        
        if sender_balance < tuas_coins:
            return await interaction.followup.send(f"❌ Não tens {self.get_coin_display(tuas_coins)}!")
        
        # Criar trade
        trade_id = await self.db.create_trade(
            guild_id=str(interaction.guild.id),
            sender_id=str(interaction.user.id),
            receiver_id=str(utilizador.id),
            sender_coins=tuas_coins,
            sender_items="",
            receiver_coins=pedes_coins,
            receiver_items=""
        )
        
        # Criar embed
        embed = discord.Embed(
            title="🤝 Proposta de Trade",
            description=f"{interaction.user.mention} propõe um trade com {utilizador.mention}",
            color=0x3498db
        )
        
        embed.add_field(
            name=f"📤 {interaction.user.display_name} oferece",
            value=self.get_coin_display(tuas_coins) if tuas_coins > 0 else "Nada",
            inline=True
        )
        
        embed.add_field(
            name=f"📥 {utilizador.display_name} oferece",
            value=self.get_coin_display(pedes_coins) if pedes_coins > 0 else "Nada",
            inline=True
        )
        
        embed.set_footer(text=f"Trade ID: {trade_id} • Expira em 5 minutos")
        
        view = TradeView(self, trade_id, interaction.user, utilizador, economy_cog)
        await interaction.followup.send(embed=embed, view=view)
    
    @app_commands.command(name="trades_pendentes", description="Ver trades pendentes")
    async def pending_trades(self, interaction: discord.Interaction):
        """Ver trades pendentes"""
        await interaction.response.defer()
        
        trades = await self.db.get_pending_trades(str(interaction.user.id), str(interaction.guild.id))
        
        if not trades:
            return await interaction.followup.send("📭 Não tens trades pendentes!")
        
        embed = discord.Embed(
            title="🤝 Trades Pendentes",
            color=0x3498db
        )
        
        for trade in trades[:10]:  # Mostrar até 10
            sender = await self.bot.fetch_user(int(trade['sender_id']))
            receiver = await self.bot.fetch_user(int(trade['receiver_id']))
            
            if trade['sender_id'] == str(interaction.user.id):
                desc = f"Com **{receiver.name}**: Tu ofereces {self.get_coin_display(trade['sender_coins'])} por {self.get_coin_display(trade['receiver_coins'])}"
            else:
                desc = f"De **{sender.name}**: Oferece {self.get_coin_display(trade['sender_coins'])} por {self.get_coin_display(trade['receiver_coins'])}"
            
            embed.add_field(
                name=f"Trade #{trade['trade_id']}",
                value=desc,
                inline=False
            )
        
        await interaction.followup.send(embed=embed)
    
    # ===== EVENTOS ESPECIAIS =====
    
    @app_commands.command(name="criar_evento", description="[ADMIN] Criar evento especial com bónus")
    @app_commands.describe(
        tipo="Tipo de evento",
        duracao="Duração em horas",
        multiplicador="Multiplicador de coins (ex: 2.0 = dobro)"
    )
    @app_commands.choices(tipo=[
        app_commands.Choice(name="🎉 Happy Hour (coins dobrados)", value="happy_hour"),
        app_commands.Choice(name="🍀 Super Sorte (apostas com bónus)", value="lucky_time"),
        app_commands.Choice(name="💰 Chuva de Ouro (todos ganham)", value="gold_rain"),
        app_commands.Choice(name="🎁 Dailies Especiais", value="special_daily")
    ])
    async def create_event(self, interaction: discord.Interaction, tipo: str, duracao: int, multiplicador: float = 2.0):
        """Criar evento especial (admin only)"""
        if not interaction.user.guild_permissions.administrator:
            return await interaction.response.send_message("❌ Apenas administradores!", ephemeral=True)
        
        await interaction.response.defer()
        
        event_names = {
            "happy_hour": "🎉 Happy Hour",
            "lucky_time": "🍀 Super Sorte",
            "gold_rain": "💰 Chuva de Ouro",
            "special_daily": "🎁 Dailies Especiais"
        }
        
        descriptions = {
            "happy_hour": f"Todas as recompensas multiplicadas por {multiplicador}x!",
            "lucky_time": f"Chances de vitória aumentadas e prémios {multiplicador}x maiores!",
            "gold_rain": "Todos os membros ativos ganham coins de bónus!",
            "special_daily": f"Daily recompensas {multiplicador}x maiores!"
        }
        
        ends_at = (datetime.now() + timedelta(hours=duracao)).isoformat()
        
        event_id = await self.db.create_event(
            guild_id=str(interaction.guild.id),
            event_type=tipo,
            event_name=event_names[tipo],
            multiplier=multiplicador,
            bonus_coins=0,
            description=descriptions[tipo],
            started_by=str(interaction.user.id),
            ends_at=ends_at
        )
        
        embed = discord.Embed(
            title=f"🎊 {event_names[tipo]} ATIVADO!",
            description=descriptions[tipo],
            color=0xf39c12
        )
        
        embed.add_field(name="⏱️ Duração", value=f"{duracao} horas", inline=True)
        embed.add_field(name="📈 Multiplicador", value=f"{multiplicador}x", inline=True)
        embed.add_field(name="👑 Iniciado por", value=interaction.user.mention, inline=True)
        
        timestamp = int(datetime.fromisoformat(ends_at).timestamp())
        embed.set_footer(text=f"Termina: {timestamp} • Event ID: {event_id}")
        
        await interaction.followup.send(f"@everyone", embed=embed)
    
    @app_commands.command(name="eventos_ativos", description="Ver eventos especiais ativos")
    async def active_events(self, interaction: discord.Interaction):
        """Ver eventos ativos"""
        await interaction.response.defer()
        
        events = await self.db.get_active_events(str(interaction.guild.id))
        
        if not events:
            return await interaction.followup.send("📭 Nenhum evento ativo no momento!")
        
        embed = discord.Embed(
            title="🎊 Eventos Ativos",
            color=0xf39c12
        )
        
        for event in events:
            embed.add_field(
                name=event['event_name'],
                value=f"{event['description']}\nMultiplicador: **{event['multiplier']}x**\nTermina: <t:{int(datetime.fromisoformat(event['ends_at']).timestamp())}:R>",
                inline=False
            )
        
        await interaction.followup.send(embed=embed)


class TradeView(discord.ui.View):
    """View para aceitar/recusar trades"""
    
    def __init__(self, cog, trade_id, sender, receiver, economy_cog):
        super().__init__(timeout=300)  # 5 minutos
        self.cog = cog
        self.trade_id = trade_id
        self.sender = sender
        self.receiver = receiver
        self.economy_cog = economy_cog
    
    @discord.ui.button(label="✅ Aceitar", style=discord.ButtonStyle.green)
    async def accept(self, interaction: discord.Interaction, button: discord.ui.Button):
        if interaction.user != self.receiver:
            return await interaction.response.send_message("❌ Apenas o destinatário pode aceitar!", ephemeral=True)
        
        await interaction.response.defer()
        
        # Obter trade
        trade = await self.cog.db.get_trade(self.trade_id)
        
        if not trade or trade['status'] != 'pending':
            return await interaction.followup.send("❌ Trade já não está disponível!")
        
        # Verificar saldos
        sender_balance = self.economy_cog.get_balance(trade['sender_id'])
        receiver_balance = self.economy_cog.get_balance(trade['receiver_id'])
        
        if sender_balance < trade['sender_offer_coins']:
            await self.cog.db.update_trade_status(self.trade_id, "cancelled")
            return await interaction.followup.send("❌ O remetente não tem coins suficientes!")
        
        if receiver_balance < trade['receiver_offer_coins']:
            await self.cog.db.update_trade_status(self.trade_id, "cancelled")
            return await interaction.followup.send("❌ Não tens coins suficientes!")
        
        # Executar trade
        if trade['sender_offer_coins'] > 0:
            self.economy_cog.remove_money(trade['sender_id'], trade['sender_offer_coins'])
            self.economy_cog.add_money(trade['receiver_id'], trade['sender_offer_coins'])
        
        if trade['receiver_offer_coins'] > 0:
            self.economy_cog.remove_money(trade['receiver_id'], trade['receiver_offer_coins'])
            self.economy_cog.add_money(trade['sender_id'], trade['receiver_offer_coins'])
        
        # Atualizar status
        await self.cog.db.update_trade_status(self.trade_id, "completed")
        
        embed = discord.Embed(
            title="✅ Trade Completado!",
            description=f"Trade entre {self.sender.mention} e {self.receiver.mention} foi completado com sucesso!",
            color=0x00ff88
        )
        
        await interaction.followup.send(embed=embed)
        
        # Desativar botões
        for item in self.children:
            item.disabled = True
        await interaction.message.edit(view=self)
    
    @discord.ui.button(label="❌ Recusar", style=discord.ButtonStyle.red)
    async def decline(self, interaction: discord.Interaction, button: discord.ui.Button):
        if interaction.user != self.receiver:
            return await interaction.response.send_message("❌ Apenas o destinatário pode recusar!", ephemeral=True)
        
        await self.cog.db.update_trade_status(self.trade_id, "declined")
        
        embed = discord.Embed(
            title="❌ Trade Recusado",
            description=f"{self.receiver.mention} recusou o trade.",
            color=0xff4444
        )
        
        await interaction.response.edit_message(embed=embed, view=None)


async def setup(bot):
    await bot.add_cog(EconomyAdvanced(bot))
