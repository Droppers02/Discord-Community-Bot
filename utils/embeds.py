"""
Sistema de Embeds Padronizados para EPA BOT
Fornece embeds consistentes e profissionais
"""

import discord
from typing import Optional, List
from datetime import datetime


class EmbedBuilder:
    """Classe para criar embeds padronizados"""
    
    # Cores do tema
    COLOR_PRIMARY = 0x5865F2    # Azul Discord
    COLOR_SUCCESS = 0x57F287    # Verde
    COLOR_ERROR = 0xED4245      # Vermelho
    COLOR_WARNING = 0xFEE75C    # Amarelo
    COLOR_INFO = 0x5865F2       # Azul
    COLOR_ECONOMY = 0xF1C40F    # Dourado
    COLOR_MODERATION = 0xE74C3C # Vermelho escuro
    COLOR_SOCIAL = 0x3498DB     # Azul claro
    
    @staticmethod
    def create_base_embed(
        title: Optional[str] = None,
        description: Optional[str] = None,
        color: int = COLOR_PRIMARY,
        timestamp: bool = True
    ) -> discord.Embed:
        """Cria um embed base"""
        embed = discord.Embed(
            title=title,
            description=description,
            color=color,
            timestamp=datetime.utcnow() if timestamp else None
        )
        return embed
    
    @staticmethod
    def success(
        title: str = "✅ Sucesso",
        description: str = None,
        **kwargs
    ) -> discord.Embed:
        """Embed de sucesso"""
        return EmbedBuilder.create_base_embed(
            title=title,
            description=description,
            color=EmbedBuilder.COLOR_SUCCESS,
            **kwargs
        )
    
    @staticmethod
    def error(
        title: str = "❌ Erro",
        description: str = None,
        **kwargs
    ) -> discord.Embed:
        """Embed de erro"""
        return EmbedBuilder.create_base_embed(
            title=title,
            description=description,
            color=EmbedBuilder.COLOR_ERROR,
            **kwargs
        )
    
    @staticmethod
    def warning(
        title: str = "⚠️ Aviso",
        description: str = None,
        **kwargs
    ) -> discord.Embed:
        """Embed de aviso"""
        return EmbedBuilder.create_base_embed(
            title=title,
            description=description,
            color=EmbedBuilder.COLOR_WARNING,
            **kwargs
        )
    
    @staticmethod
    def info(
        title: str = "ℹ️ Informação",
        description: str = None,
        **kwargs
    ) -> discord.Embed:
        """Embed informativo"""
        return EmbedBuilder.create_base_embed(
            title=title,
            description=description,
            color=EmbedBuilder.COLOR_INFO,
            **kwargs
        )
    
    @staticmethod
    def economy(
        title: str,
        description: str = None,
        **kwargs
    ) -> discord.Embed:
        """Embed para sistema de economia"""
        embed = EmbedBuilder.create_base_embed(
            title=f"💰 {title}",
            description=description,
            color=EmbedBuilder.COLOR_ECONOMY,
            **kwargs
        )
        return embed
    
    @staticmethod
    def moderation(
        title: str,
        description: str = None,
        **kwargs
    ) -> discord.Embed:
        """Embed para ações de moderação"""
        embed = EmbedBuilder.create_base_embed(
            title=f"🛡️ {title}",
            description=description,
            color=EmbedBuilder.COLOR_MODERATION,
            **kwargs
        )
        return embed
    
    @staticmethod
    def level_up(
        user: discord.Member,
        level: int,
        xp: int
    ) -> discord.Embed:
        """Embed de level up"""
        embed = EmbedBuilder.create_base_embed(
            title="🎉 Level Up!",
            description=f"{user.mention} subiu para o **Nível {level}**!",
            color=EmbedBuilder.COLOR_SOCIAL
        )
        embed.add_field(name="XP Total", value=f"{xp:,} XP", inline=True)
        embed.add_field(name="Próximo Nível", value=f"{((level) ** 2) * 100:,} XP", inline=True)
        embed.set_thumbnail(url=user.display_avatar.url)
        return embed
    
    @staticmethod
    def user_profile(
        user: discord.Member,
        balance: int,
        level: int,
        xp: int,
        rank: int,
        messages: int
    ) -> discord.Embed:
        """Embed de perfil de utilizador"""
        embed = EmbedBuilder.create_base_embed(
            title=f"Perfil de {user.display_name}",
            color=EmbedBuilder.COLOR_PRIMARY
        )
        embed.set_thumbnail(url=user.display_avatar.url)
        
        # Economia
        embed.add_field(
            name="💰 Economia",
            value=f"Saldo: **{balance:,}** <:epacoin2:1407389417290727434>",
            inline=True
        )
        
        # Nível
        xp_needed = ((level) ** 2) * 100
        embed.add_field(
            name="📊 Progressão",
            value=f"Nível: **{level}**\nXP: **{xp:,}** / {xp_needed:,}\nRank: **#{rank}**",
            inline=True
        )
        
        # Atividade
        embed.add_field(
            name="💬 Atividade",
            value=f"Mensagens: **{messages:,}**",
            inline=True
        )
        
        return embed
    
    @staticmethod
    def leaderboard(
        title: str,
        entries: List[tuple],
        guild: discord.Guild,
        page: int = 1,
        total_pages: int = 1
    ) -> discord.Embed:
        """Embed de leaderboard com paginação"""
        embed = EmbedBuilder.create_base_embed(
            title=f"🏆 {title}",
            color=EmbedBuilder.COLOR_PRIMARY
        )
        
        if not entries:
            embed.description = "Nenhum dado disponível."
            return embed
        
        description_lines = []
        start_rank = (page - 1) * 10
        
        for i, (user_id, value, extra) in enumerate(entries, start=start_rank + 1):
            user = guild.get_member(int(user_id))
            user_name = user.display_name if user else f"Utilizador {user_id}"
            
            # Medalhas para top 3
            if i == 1:
                medal = "🥇"
            elif i == 2:
                medal = "🥈"
            elif i == 3:
                medal = "🥉"
            else:
                medal = f"`#{i}`"
            
            description_lines.append(f"{medal} **{user_name}** - {value:,} {extra}")
        
        embed.description = "\n".join(description_lines)
        
        if total_pages > 1:
            embed.set_footer(text=f"Página {page}/{total_pages}")
        
        return embed
    
    @staticmethod
    def help_command(
        title: str,
        commands_dict: dict,
        page: int = 1,
        total_pages: int = 1
    ) -> discord.Embed:
        """Embed para comando de ajuda"""
        embed = EmbedBuilder.create_base_embed(
            title=f"📚 {title}",
            description="Lista de comandos disponíveis",
            color=EmbedBuilder.COLOR_INFO
        )
        
        for category, commands in commands_dict.items():
            if commands:
                commands_text = "\n".join([f"`/{cmd['name']}` - {cmd['desc']}" for cmd in commands])
                embed.add_field(name=f"**{category}**", value=commands_text, inline=False)
        
        if total_pages > 1:
            embed.set_footer(text=f"Página {page}/{total_pages} • Use /help <categoria> para mais detalhes")
        else:
            embed.set_footer(text="Use /help <comando> para mais detalhes")
        
        return embed
    
    @staticmethod
    def moderation_log(
        action: str,
        user: discord.Member,
        moderator: discord.Member,
        reason: str = None,
        duration: str = None
    ) -> discord.Embed:
        """Embed para log de moderação"""
        embed = EmbedBuilder.moderation(
            title=f"Ação: {action.upper()}",
            description=f"**Utilizador:** {user.mention} (`{user.id}`)\n**Moderador:** {moderator.mention}"
        )
        
        if reason:
            embed.add_field(name="Motivo", value=reason, inline=False)
        
        if duration:
            embed.add_field(name="Duração", value=duration, inline=True)
        
        embed.set_thumbnail(url=user.display_avatar.url)
        
        return embed
    
    @staticmethod
    def transaction(
        from_user: Optional[discord.Member],
        to_user: Optional[discord.Member],
        amount: int,
        transaction_type: str,
        description: str = None
    ) -> discord.Embed:
        """Embed para transações"""
        if from_user and to_user:
            title = "💸 Transferência"
            desc = f"{from_user.mention} ➡️ {to_user.mention}"
        elif to_user:
            title = "💰 Recebido"
            desc = f"{to_user.mention} recebeu"
        else:
            title = "💸 Gasto"
            desc = f"{from_user.mention} gastou"
        
        embed = EmbedBuilder.economy(
            title=title,
            description=desc
        )
        
        embed.add_field(
            name="Quantia",
            value=f"**{amount:,}** <:epacoin2:1407389417290727434>",
            inline=True
        )
        
        if description:
            embed.add_field(name="Descrição", value=description, inline=False)
        
        return embed
