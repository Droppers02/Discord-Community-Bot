"""
Sistema de Tickets para Discord Bot
Funcionalidades completas com database, transcrições e gestão avançada
"""

import discord
from discord.ext import commands
from discord import app_commands
from typing import Optional
from datetime import datetime
import asyncio
import io

from utils.database import Database
from utils.embeds import EmbedBuilder
from utils.logger import bot_logger


class TicketCategorySelect(discord.ui.Select):
    """Dropdown para seleção de categoria do ticket"""
    
    def __init__(self):
        options = [
            discord.SelectOption(
                label="Suporte Técnico",
                value="technical",
                description="Problemas técnicos com o bot ou servidor",
                emoji="🛠️"
            ),
            discord.SelectOption(
                label="Dúvida Geral",
                value="general",
                description="Questões sobre funcionamento ou regras",
                emoji="❓"
            ),
            discord.SelectOption(
                label="Reportar Utilizador",
                value="report",
                description="Reportar comportamento inadequado",
                emoji="⚠️"
            ),
            discord.SelectOption(
                label="Sugestão",
                value="suggestion",
                description="Sugerir melhorias para o servidor",
                emoji="💡"
            ),
            discord.SelectOption(
                label="Outros",
                value="other",
                description="Outros assuntos",
                emoji="📝"
            )
        ]
        
        super().__init__(
            placeholder="🎫 Seleciona a categoria...",
            min_values=1,
            max_values=1,
            options=options,
            custom_id="ticket_category"
        )
    
    async def callback(self, interaction: discord.Interaction):
        """Callback quando categoria é selecionada"""
        db = Database()
        
        # Verificar limite de tickets ativos (3)
        active_count = await db.execute(
            "SELECT COUNT(*) FROM tickets WHERE user_id = ? AND status = 'open'",
            (interaction.user.id,)
        )
        
        if active_count and active_count[0][0] >= 3:
            embed = EmbedBuilder.error(
                title="Limite Atingido",
                description="Já tens **3 tickets ativos**!\n\nFecha alguns antes de abrir mais."
            )
            embed.add_field(
                name="Como fechar?",
                value="Usa `/fecharticket` dentro do ticket",
                inline=False
            )
            await interaction.response.send_message(embed=embed, ephemeral=True)
            return
        
        # Criar ticket
        await self._create_ticket(interaction, self.values[0])
    
    async def _create_ticket(self, interaction: discord.Interaction, category: str):
        """Cria novo ticket"""
        try:
            # Info da categoria
            category_info = {
                "technical": {"name": "Suporte Técnico", "emoji": "🛠️"},
                "general": {"name": "Dúvida Geral", "emoji": "❓"},
                "report": {"name": "Report", "emoji": "⚠️"},
                "suggestion": {"name": "Sugestão", "emoji": "💡"},
                "other": {"name": "Outros", "emoji": "📝"}
            }
            
            info = category_info.get(category, {"name": "Geral", "emoji": "🎫"})
            
            # Obter categoria configurada (ou canal atual se não configurado)
            from config.settings import config
            ticket_category = None
            if config.ticket_category_id:
                ticket_category = interaction.guild.get_channel(config.ticket_category_id)
            
            # Criar thread privada
            thread = await interaction.channel.create_thread(
                name=f"{info['emoji']} {info['name']} - {interaction.user.display_name}",
                auto_archive_duration=4320,  # 3 dias
                type=discord.ChannelType.private_thread,
                reason=f"Ticket por {interaction.user}"
            )
            
            # Adicionar usuário
            await thread.add_user(interaction.user)
            
            # Guardar na database
            db = Database()
            await db.execute(
                "INSERT INTO tickets (user_id, thread_id, category, status, created_at) VALUES (?, ?, ?, ?, ?)",
                (interaction.user.id, thread.id, category, 'open', datetime.now().isoformat())
            )
            
            # Resposta ao usuário
            embed = EmbedBuilder.success(
                title="Ticket Criado",
                description=f"O teu ticket foi criado: {thread.mention}\n\nA equipa responderá em breve."
            )
            await interaction.response.send_message(embed=embed, ephemeral=True)
            
            # Mensagem inicial do ticket
            embed = EmbedBuilder.create(
                title=f"{info['emoji']} {info['name']} - Ticket #{thread.id}",
                description=f"**Utilizador:** {interaction.user.mention}\n"
                           f"**Categoria:** {info['name']}\n"
                           f"**Criado:** <t:{int(datetime.now().timestamp())}:R>",
                color=discord.Color.blue()
            )
            
            embed.add_field(
                name="📝 Próximos Passos",
                value="• Descreve o teu problema detalhadamente\n"
                      "• Anexa screenshots se necessário\n"
                      "• Aguarda resposta da equipa\n"
                      "• Usa `/fecharticket` quando resolvido",
                inline=False
            )
            
            if category == "report":
                embed.add_field(
                    name="⚠️ Informação Importante",
                    value="• Menciona o utilizador reportado\n"
                          "• Descreve o ocorrido\n"
                          "• Fornece evidências\n"
                          "• Reports falsos = punição",
                    inline=False
                )
            
            # View com controlos
            view = TicketControlView()
            
            # Mencionar role de moderação se configurado
            from config.settings import config
            mention = f"<@&{config.mod_role_id}>" if config.mod_role_id else ""
            
            await thread.send(content=mention, embed=embed, view=view)
            
            bot_logger.info(f"Ticket #{thread.id} criado por {interaction.user} (categoria: {category})")
            
        except Exception as e:
            bot_logger.error(f"Erro ao criar ticket: {e}")
            embed = EmbedBuilder.error(
                title="Erro",
                description="Ocorreu um erro ao criar o ticket. Tenta novamente."
            )
            await interaction.response.send_message(embed=embed, ephemeral=True)


class TicketControlView(discord.ui.View):
    """View com controlos do ticket"""
    
    def __init__(self):
        super().__init__(timeout=None)
    
    @discord.ui.button(label="Fechar Ticket", style=discord.ButtonStyle.danger, emoji="🔒", custom_id="close_ticket")
    async def close_ticket(self, interaction: discord.Interaction, button: discord.ui.Button):
        """Fecha o ticket"""
        if not isinstance(interaction.channel, discord.Thread):
            await interaction.response.send_message("❌ Só funciona em tickets!", ephemeral=True)
            return
        
        # Verificar permissões
        db = Database()
        ticket = await db.execute(
            "SELECT user_id FROM tickets WHERE thread_id = ? AND status = 'open'",
            (interaction.channel.id,)
        )
        
        if not ticket:
            await interaction.response.send_message("❌ Ticket não encontrado!", ephemeral=True)
            return
        
        is_owner = ticket[0][0] == interaction.user.id
        from config.settings import config
        is_staff = (config.mod_role_id and 
                   interaction.guild.get_role(config.mod_role_id) in interaction.user.roles)
        is_admin = interaction.user.guild_permissions.administrator
        
        if not (is_owner or is_staff or is_admin):
            await interaction.response.send_message("❌ Sem permissão!", ephemeral=True)
            return
        
        # Confirmar
        view = ConfirmCloseView()
        embed = EmbedBuilder.warning(
            title="Confirmar Fechamento",
            description="Tens a certeza?\n\n**Esta ação não pode ser desfeita.**"
        )
        await interaction.response.send_message(embed=embed, view=view, ephemeral=True)
    
    @discord.ui.button(label="Transcrição", style=discord.ButtonStyle.secondary, emoji="📄", custom_id="transcript")
    async def create_transcript(self, interaction: discord.Interaction, button: discord.ui.Button):
        """Cria transcrição do ticket"""
        if not isinstance(interaction.channel, discord.Thread):
            await interaction.response.send_message("❌ Só funciona em tickets!", ephemeral=True)
            return
        
        await interaction.response.defer(ephemeral=True)
        
        try:
            # Buscar todas as mensagens
            messages = []
            async for message in interaction.channel.history(limit=None, oldest_first=True):
                messages.append(message)
            
            # Criar transcrição HTML
            transcript = await self._generate_transcript(messages, interaction.guild)
            
            # Enviar ficheiro
            file = discord.File(
                fp=io.BytesIO(transcript.encode('utf-8')),
                filename=f"transcript-{interaction.channel.id}.html"
            )
            
            embed = EmbedBuilder.success(
                title="Transcrição Criada",
                description=f"**Ticket:** {interaction.channel.name}\n"
                           f"**Mensagens:** {len(messages)}\n"
                           f"**Data:** <t:{int(datetime.now().timestamp())}:F>"
            )
            
            await interaction.followup.send(embed=embed, file=file, ephemeral=True)
            bot_logger.info(f"Transcrição criada para ticket #{interaction.channel.id}")
            
        except Exception as e:
            bot_logger.error(f"Erro ao criar transcrição: {e}")
            await interaction.followup.send("❌ Erro ao criar transcrição!", ephemeral=True)
    
    async def _generate_transcript(self, messages: list, guild: discord.Guild) -> str:
        """Gera HTML da transcrição"""
        html = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Transcrição - {guild.name}</title>
    <style>
        body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #36393f; color: #dcddde; padding: 20px; }}
        .container {{ max-width: 800px; margin: 0 auto; background: #2f3136; border-radius: 8px; padding: 20px; }}
        .header {{ border-bottom: 2px solid #202225; padding-bottom: 15px; margin-bottom: 20px; }}
        .message {{ margin: 15px 0; padding: 10px; border-left: 3px solid #5865F2; background: #40444b; border-radius: 4px; }}
        .author {{ font-weight: bold; color: #00aff4; margin-bottom: 5px; }}
        .timestamp {{ color: #72767d; font-size: 0.8em; }}
        .content {{ margin-top: 8px; line-height: 1.5; }}
        .attachment {{ color: #00aff4; text-decoration: none; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📝 Transcrição do Ticket</h1>
            <p><strong>Servidor:</strong> {guild.name}</p>
            <p><strong>Total de Mensagens:</strong> {len(messages)}</p>
            <p><strong>Gerado em:</strong> {datetime.now().strftime('%d/%m/%Y às %H:%M:%S')}</p>
        </div>
"""
        
        for msg in messages:
            timestamp = msg.created_at.strftime('%d/%m/%Y %H:%M:%S')
            content = msg.content.replace('<', '&lt;').replace('>', '&gt;')
            
            html += f"""
        <div class="message">
            <div class="author">{msg.author.display_name}</div>
            <div class="timestamp">{timestamp}</div>
            <div class="content">{content if content else '<em>Sem conteúdo</em>'}</div>
"""
            
            if msg.attachments:
                for att in msg.attachments:
                    html += f'            <div><a href="{att.url}" class="attachment">📎 {att.filename}</a></div>\n'
            
            html += "        </div>\n"
        
        html += """
    </div>
</body>
</html>
"""
        return html


class ConfirmCloseView(discord.ui.View):
    """Confirmação para fechar ticket"""
    
    def __init__(self):
        super().__init__(timeout=60)
    
    @discord.ui.button(label="Sim, Fechar", style=discord.ButtonStyle.danger, emoji="✅")
    async def confirm(self, interaction: discord.Interaction, button: discord.ui.Button):
        """Confirma fechamento"""
        thread = interaction.channel
        
        # Atualizar database
        db = Database()
        await db.execute(
            "UPDATE tickets SET status = 'closed', closed_at = ?, closed_by = ? WHERE thread_id = ?",
            (datetime.now().isoformat(), interaction.user.id, thread.id)
        )
        
        # Mensagem final
        embed = EmbedBuilder.success(
            title="Ticket Fechado",
            description=f"**Fechado por:** {interaction.user.mention}\n"
                       f"**Data:** <t:{int(datetime.now().timestamp())}:F>\n\n"
                       "Obrigado por usar o sistema de tickets!"
        )
        embed.set_footer(text="O ticket será arquivado em 10 segundos...")
        
        await interaction.response.send_message(embed=embed)
        
        bot_logger.info(f"Ticket #{thread.id} fechado por {interaction.user}")
        
        # Arquivar
        await asyncio.sleep(10)
        await thread.edit(archived=True, locked=True)
    
    @discord.ui.button(label="Cancelar", style=discord.ButtonStyle.secondary, emoji="❌")
    async def cancel(self, interaction: discord.Interaction, button: discord.ui.Button):
        """Cancela fechamento"""
        embed = EmbedBuilder.info(
            title="Cancelado",
            description="O ticket permanece aberto."
        )
        await interaction.response.send_message(embed=embed, ephemeral=True)


class TicketPanelView(discord.ui.View):
    """View do painel de tickets"""
    
    def __init__(self):
        super().__init__(timeout=None)
        self.add_item(TicketCategorySelect())


class Tickets(commands.Cog):
    """Sistema de tickets"""
    
    def __init__(self, bot):
        self.bot = bot
        self.db = Database()
    
    async def cog_load(self):
        """Carrega views persistentes"""
        self.bot.add_view(TicketPanelView())
        self.bot.add_view(TicketControlView())
        bot_logger.info("Sistema de tickets carregado")
    
    @app_commands.command(name="setup_tickets", description="[ADMIN] Configura o painel de tickets")
    @app_commands.default_permissions(administrator=True)
    async def setup_tickets(self, interaction: discord.Interaction):
        """Configura painel de tickets"""
        
        # Stats
        stats = await self.db.execute(
            "SELECT COUNT(*) FROM tickets WHERE status = 'closed'",
            ()
        )
        total_closed = stats[0][0] if stats else 0
        
        stats = await self.db.execute(
            "SELECT COUNT(*) FROM tickets",
            ()
        )
        total_created = stats[0][0] if stats else 0
        
        resolution_rate = round((total_closed / max(total_created, 1)) * 100)
        
        # Embed
        embed = EmbedBuilder.create(
            title="🎫 Sistema de Tickets",
            description="**Precisa de ajuda?**\n\n"
                       "Seleciona a categoria abaixo.\n"
                       "A equipa responderá em breve!\n\n"
                       "🔸 **Limite:** 3 tickets ativos\n"
                       "🔸 **Disponibilidade:** 24/7",
            color=discord.Color.blue()
        )
        
        embed.add_field(
            name="📋 Categorias",
            value="🛠️ Suporte Técnico\n"
                  "❓ Dúvidas Gerais\n"
                  "⚠️ Reports\n"
                  "💡 Sugestões\n"
                  "📝 Outros",
            inline=True
        )
        
        embed.add_field(
            name="🛡️ Regras",
            value="• Respeito sempre\n"
                  "• Detalhes suficientes\n"
                  "• Não abuses\n"
                  "• Spam = punição",
            inline=True
        )
        
        embed.add_field(
            name="📊 Stats",
            value=f"**Criados:** {total_created}\n"
                  f"**Fechados:** {total_closed}\n"
                  f"**Taxa:** {resolution_rate}%",
            inline=True
        )
        
        if interaction.guild.icon:
            embed.set_thumbnail(url=interaction.guild.icon.url)
        
        await interaction.response.send_message("✅ Painel configurado!", ephemeral=True)
        await interaction.followup.send(embed=embed, view=TicketPanelView())
    
    @app_commands.command(name="fecharticket", description="Fecha o ticket atual")
    async def close_ticket(self, interaction: discord.Interaction):
        """Fecha ticket"""
        
        if not isinstance(interaction.channel, discord.Thread):
            embed = EmbedBuilder.error(
                title="Erro",
                description="Este comando só funciona em tickets!"
            )
            await interaction.response.send_message(embed=embed, ephemeral=True)
            return
        
        # Verificar se é ticket
        ticket = await self.db.execute(
            "SELECT user_id FROM tickets WHERE thread_id = ? AND status = 'open'",
            (interaction.channel.id,)
        )
        
        if not ticket:
            await interaction.response.send_message("❌ Ticket não encontrado!", ephemeral=True)
            return
        
        # Verificar permissões
        is_owner = ticket[0][0] == interaction.user.id
        from config.settings import config
        is_staff = (config.mod_role_id and 
                   interaction.guild.get_role(config.mod_role_id) in interaction.user.roles)
        is_admin = interaction.user.guild_permissions.administrator
        
        if not (is_owner or is_staff or is_admin):
            embed = EmbedBuilder.error(
                title="Sem Permissão",
                description="Só o criador, staff ou admins podem fechar!"
            )
            await interaction.response.send_message(embed=embed, ephemeral=True)
            return
        
        # Confirmar
        view = ConfirmCloseView()
        embed = EmbedBuilder.warning(
            title="Confirmar",
            description="Tens a certeza?\n\n**Não pode ser desfeito.**"
        )
        await interaction.response.send_message(embed=embed, view=view, ephemeral=True)
    
    @app_commands.command(name="ticket_stats", description="[ADMIN] Ver estatísticas de tickets")
    @app_commands.default_permissions(administrator=True)
    async def ticket_stats(self, interaction: discord.Interaction):
        """Ver stats dos tickets"""
        
        # Total
        total = await self.db.execute("SELECT COUNT(*) FROM tickets", ())
        total_count = total[0][0] if total else 0
        
        # Fechados
        closed = await self.db.execute("SELECT COUNT(*) FROM tickets WHERE status = 'closed'", ())
        closed_count = closed[0][0] if closed else 0
        
        # Ativos
        active = await self.db.execute("SELECT COUNT(*) FROM tickets WHERE status = 'open'", ())
        active_count = active[0][0] if active else 0
        
        # Por categoria
        categories = await self.db.execute(
            "SELECT category, COUNT(*) FROM tickets GROUP BY category",
            ()
        )
        
        embed = EmbedBuilder.create(
            title="📊 Estatísticas de Tickets",
            color=discord.Color.blue()
        )
        
        embed.add_field(
            name="📈 Números Gerais",
            value=f"**Total:** {total_count}\n"
                  f"**Fechados:** {closed_count}\n"
                  f"**Ativos:** {active_count}\n"
                  f"**Taxa:** {round((closed_count/max(total_count,1))*100)}%",
            inline=True
        )
        
        if categories:
            cat_names = {
                "technical": "🛠️ Técnico",
                "general": "❓ Geral",
                "report": "⚠️ Reports",
                "suggestion": "💡 Sugestões",
                "other": "📝 Outros"
            }
            
            cat_text = ""
            for cat, count in categories:
                name = cat_names.get(cat, cat.title())
                cat_text += f"{name}: {count}\n"
            
            embed.add_field(
                name="📋 Por Categoria",
                value=cat_text,
                inline=True
            )
        
        await interaction.response.send_message(embed=embed, ephemeral=True)


async def setup(bot):
    """Carrega o cog"""
    await bot.add_cog(Tickets(bot))
