"""
Sistema Avançado de Utilidades
Includes: Lembretes, Polls, Anúncios, Auto-roles, Verificação
"""

import discord
from discord.ext import commands, tasks
from discord import app_commands
from datetime import datetime, timedelta
import asyncio
import json
import os
from typing import Optional
import random
import string

from utils.embeds import EmbedBuilder
from utils.logger import bot_logger


class PollView(discord.ui.View):
    """View para sistema de votação"""
    
    def __init__(self, poll_data):
        super().__init__(timeout=None)
        self.poll_data = poll_data
        
        # Adicionar botões para cada opção (máximo 5)
        for i, option in enumerate(poll_data['options'][:5]):
            button = discord.ui.Button(
                label=f"{option['emoji']} {option['text']}",
                style=discord.ButtonStyle.primary,
                custom_id=f"poll_{poll_data['id']}_{i}"
            )
            button.callback = self.vote_callback
            self.add_item(button)
    
    async def vote_callback(self, interaction: discord.Interaction):
        """Processar voto"""
        # Extrair índice da opção
        option_index = int(interaction.data['custom_id'].split('_')[-1])
        user_id = str(interaction.user.id)
        
        # Verificar se já votou
        if user_id in self.poll_data['voters']:
            await interaction.response.send_message(
                "❌ Já votaste nesta poll!",
                ephemeral=True
            )
            return
        
        # Registar voto
        self.poll_data['voters'].add(user_id)
        self.poll_data['options'][option_index]['votes'] += 1
        
        # Atualizar embed
        embed = self.create_poll_embed()
        await interaction.response.edit_message(embed=embed, view=self)
        
        await interaction.followup.send(
            f"✅ Voto registado: {self.poll_data['options'][option_index]['text']}",
            ephemeral=True
        )
    
    def create_poll_embed(self):
        """Criar embed da poll"""
        embed = discord.Embed(
            title=f"📊 {self.poll_data['question']}",
            description=self.poll_data.get('description', ''),
            color=discord.Color.blue(),
            timestamp=datetime.now()
        )
        
        total_votes = sum(opt['votes'] for opt in self.poll_data['options'])
        
        for option in self.poll_data['options']:
            votes = option['votes']
            percentage = (votes / total_votes * 100) if total_votes > 0 else 0
            bar_length = int(percentage / 10)
            bar = "█" * bar_length + "░" * (10 - bar_length)
            
            embed.add_field(
                name=f"{option['emoji']} {option['text']}",
                value=f"{bar} {votes} votos ({percentage:.1f}%)",
                inline=False
            )
        
        embed.set_footer(text=f"Total de votos: {total_votes}")
        return embed


class AutoRoleView(discord.ui.View):
    """View permanente para auto-roles"""
    
    def __init__(self):
        super().__init__(timeout=None)
    
    @discord.ui.button(
        label="🎮 Gacha",
        style=discord.ButtonStyle.secondary,
        custom_id="role_gacha"
    )
    async def gacha(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, 983713090795347988)
    
    @discord.ui.button(
        label="🔫 CSGO",
        style=discord.ButtonStyle.secondary,
        custom_id="role_csgo"
    )
    async def csgo(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, 984076131277893634)
    
    @discord.ui.button(
        label="🎯 Valorant",
        style=discord.ButtonStyle.secondary,
        custom_id="role_valorant"
    )
    async def valorant(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, 984075603655397416)
    
    @discord.ui.button(
        label="🎮 Overwatch",
        style=discord.ButtonStyle.secondary,
        custom_id="role_overwatch"
    )
    async def overwatch(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, 984079929576673290)
    
    @discord.ui.button(
        label="⚔️ League of Legends",
        style=discord.ButtonStyle.secondary,
        custom_id="role_lol"
    )
    async def lol(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, 984079118155022346)
    
    @discord.ui.button(
        label="🎌 Anime",
        style=discord.ButtonStyle.secondary,
        custom_id="role_anime",
        row=1
    )
    async def anime(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, 1085243051800285255)
    
    @discord.ui.button(
        label="🦖 Ark",
        style=discord.ButtonStyle.secondary,
        custom_id="role_ark",
        row=1
    )
    async def ark(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, 984077973621719050)
    
    @discord.ui.button(
        label="🃏 Runeterra",
        style=discord.ButtonStyle.secondary,
        custom_id="role_runeterra",
        row=1
    )
    async def runeterra(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, 984079324514750494)
    
    @discord.ui.button(
        label="🚗 GTA V RP",
        style=discord.ButtonStyle.secondary,
        custom_id="role_gta",
        row=1
    )
    async def gta(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, 984078259794874408)
    
    @discord.ui.button(
        label="🚀 Rocket League",
        style=discord.ButtonStyle.secondary,
        custom_id="role_rocket",
        row=1
    )
    async def rocket(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, 984078450891558923)
    
    @discord.ui.button(
        label="🦸 Marvel Rivals",
        style=discord.ButtonStyle.secondary,
        custom_id="role_marvel",
        row=2
    )
    async def marvel(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, 1318275263263412294)
    
    @discord.ui.button(
        label="⛏️ Minecraft",
        style=discord.ButtonStyle.secondary,
        custom_id="role_minecraft",
        row=2
    )
    async def minecraft(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, 984077127349571594)
    
    @discord.ui.button(
        label="🔪 Dead by Daylight",
        style=discord.ButtonStyle.secondary,
        custom_id="role_dbd",
        row=2
    )
    async def dbd(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, 984080200109273148)
    
    @discord.ui.button(
        label="🎮 Fortnite",
        style=discord.ButtonStyle.secondary,
        custom_id="role_fortnite",
        row=2
    )
    async def fortnite(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, 984076759211343872)
    
    @discord.ui.button(
        label="🎨 Roblox",
        style=discord.ButtonStyle.secondary,
        custom_id="role_roblox",
        row=2
    )
    async def roblox(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, 1155146697350074408)
    
    @discord.ui.button(
        label="🎮 PlayStation",
        style=discord.ButtonStyle.primary,
        custom_id="role_ps",
        row=3
    )
    async def ps(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, 869999110181249064)
    
    @discord.ui.button(
        label="🎮 Xbox",
        style=discord.ButtonStyle.success,
        custom_id="role_xbox",
        row=3
    )
    async def xbox(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, 869999804556664862)
    
    @discord.ui.button(
        label="💻 PC",
        style=discord.ButtonStyle.secondary,
        custom_id="role_pc",
        row=3
    )
    async def pc(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, 869999923452604476)
    
    @discord.ui.button(
        label="📱 Mobile",
        style=discord.ButtonStyle.secondary,
        custom_id="role_mobile",
        row=3
    )
    async def mobile(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, 869999970894368818)
    
    @discord.ui.button(
        label="✅ Podem enviar DM",
        style=discord.ButtonStyle.success,
        custom_id="role_can_dm",
        row=4
    )
    async def can_dm(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, 870000429788971009)
    
    @discord.ui.button(
        label="📩 Perguntar para DM",
        style=discord.ButtonStyle.primary,
        custom_id="role_ask_dm",
        row=4
    )
    async def ask_dm(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, 870000027962048632)
    
    @discord.ui.button(
        label="❌ Não enviar DM",
        style=discord.ButtonStyle.danger,
        custom_id="role_no_dm",
        row=4
    )
    async def no_dm(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, 870000122510049311)
    
    async def toggle_role(self, interaction: discord.Interaction, role_id: int):
        """Toggle role do membro"""
        role = interaction.guild.get_role(role_id)
        
        if not role:
            await interaction.response.send_message(
                "❌ Role não encontrada!",
                ephemeral=True
            )
            return
        
        member = interaction.user
        
        if role in member.roles:
            await member.remove_roles(role)
            await interaction.response.send_message(
                f"➖ Role **{role.name}** removida!",
                ephemeral=True
            )
        else:
            await member.add_roles(role)
            await interaction.response.send_message(
                f"➕ Role **{role.name}** adicionada!",
                ephemeral=True
            )


class VerificationView(discord.ui.View):
    """View para verificação de membros"""
    
    def __init__(self):
        super().__init__(timeout=None)
    
    @discord.ui.button(
        label="✅ Verificar",
        style=discord.ButtonStyle.success,
        custom_id="verify_button",
        emoji="✅"
    )
    async def verify(self, interaction: discord.Interaction, button: discord.ui.Button):
        """Verificar membro"""
        verified_role_id = 870001773648171178
        verified_role = interaction.guild.get_role(verified_role_id)
        
        if not verified_role:
            await interaction.response.send_message(
                "❌ Role de verificado não encontrada!",
                ephemeral=True
            )
            return
        
        member = interaction.user
        
        if verified_role in member.roles:
            await interaction.response.send_message(
                "✅ Já estás verificado!",
                ephemeral=True
            )
            return
        
        # Adicionar role de verificado
        try:
            await member.add_roles(verified_role)
            
            embed = discord.Embed(
                title="✅ Verificação Concluída!",
                description=f"Bem-vindo ao servidor, {member.mention}!\n\n"
                           f"Agora tens acesso a todos os canais.\n"
                           f"Não te esqueças de pegar nas tuas roles em <#869989783856877618>!",
                color=discord.Color.green(),
                timestamp=datetime.now()
            )
            embed.set_thumbnail(url=member.display_avatar.url)
            embed.set_footer(text=f"EPA BOT • Verificação")
            
            await interaction.response.send_message(
                embed=embed,
                ephemeral=True
            )
            
            bot_logger.info(f"Membro {member} verificado com sucesso")
            
        except discord.Forbidden:
            await interaction.response.send_message(
                "❌ Não tenho permissões para dar roles!",
                ephemeral=True
            )
        except Exception as e:
            bot_logger.error(f"Erro ao verificar membro: {e}")
            await interaction.response.send_message(
                "❌ Ocorreu um erro ao verificar-te. Contacta um administrador!",
                ephemeral=True
            )


class UtilitiesAdvanced(commands.Cog):
    """Sistema avançado de utilidades"""
    
    def __init__(self, bot):
        self.bot = bot
        self.reminders_file = "data/reminders.json"
        self.polls_file = "data/polls.json"
        self.scheduled_announcements_file = "data/scheduled_announcements.json"
        
        self.ensure_data_files()
        self.load_data()
        
        # Iniciar tasks
        self.check_reminders.start()
        self.check_announcements.start()
    
    def ensure_data_files(self):
        """Garantir que os ficheiros de dados existem"""
        os.makedirs("data", exist_ok=True)
        
        for file in [self.reminders_file, self.polls_file, self.scheduled_announcements_file]:
            if not os.path.exists(file):
                with open(file, 'w', encoding='utf-8') as f:
                    json.dump([], f)
    
    def load_data(self):
        """Carregar dados dos ficheiros"""
        with open(self.reminders_file, 'r', encoding='utf-8') as f:
            self.reminders = json.load(f)
        
        with open(self.polls_file, 'r', encoding='utf-8') as f:
            self.polls = json.load(f)
        
        with open(self.scheduled_announcements_file, 'r', encoding='utf-8') as f:
            self.scheduled_announcements = json.load(f)
    
    def save_reminders(self):
        """Guardar lembretes"""
        with open(self.reminders_file, 'w', encoding='utf-8') as f:
            json.dump(self.reminders, f, indent=2)
    
    def save_polls(self):
        """Guardar polls"""
        with open(self.polls_file, 'w', encoding='utf-8') as f:
            json.dump(self.polls, f, indent=2)
    
    def save_announcements(self):
        """Guardar anúncios agendados"""
        with open(self.scheduled_announcements_file, 'w', encoding='utf-8') as f:
            json.dump(self.scheduled_announcements, f, indent=2)
    
    async def cog_load(self):
        """Carregar views persistentes"""
        self.bot.add_view(AutoRoleView())
        self.bot.add_view(VerificationView())
        bot_logger.info("Sistema avançado de utilidades carregado")
    
    def cog_unload(self):
        """Parar tasks ao descarregar"""
        self.check_reminders.cancel()
        self.check_announcements.cancel()
    
    @tasks.loop(minutes=1)
    async def check_reminders(self):
        """Verificar lembretes pendentes"""
        now = datetime.now().timestamp()
        completed = []
        
        for reminder in self.reminders:
            if reminder['time'] <= now:
                # Enviar lembrete
                try:
                    channel = self.bot.get_channel(int(reminder['channel_id']))
                    user = await self.bot.fetch_user(int(reminder['user_id']))
                    
                    if channel and user:
                        embed = discord.Embed(
                            title="⏰ Lembrete!",
                            description=reminder['message'],
                            color=discord.Color.orange(),
                            timestamp=datetime.now()
                        )
                        embed.set_footer(text=f"Definido há {self.format_time_ago(reminder['created_at'])}")
                        
                        await channel.send(content=user.mention, embed=embed)
                        
                        # Se for recorrente, reagendar
                        if reminder.get('recurring'):
                            reminder['time'] = now + reminder['interval']
                        else:
                            completed.append(reminder)
                    else:
                        completed.append(reminder)
                        
                except Exception as e:
                    bot_logger.error(f"Erro ao enviar lembrete: {e}")
                    completed.append(reminder)
        
        # Remover lembretes completados
        for reminder in completed:
            if reminder in self.reminders:
                self.reminders.remove(reminder)
        
        if completed:
            self.save_reminders()
    
    @tasks.loop(minutes=1)
    async def check_announcements(self):
        """Verificar anúncios agendados"""
        now = datetime.now().timestamp()
        completed = []
        
        for announcement in self.scheduled_announcements:
            if announcement['time'] <= now:
                try:
                    channel = self.bot.get_channel(int(announcement['channel_id']))
                    
                    if channel:
                        if announcement.get('embed'):
                            # Anúncio com embed
                            embed_data = announcement['embed']
                            embed = discord.Embed(
                                title=embed_data.get('title'),
                                description=embed_data.get('description'),
                                color=discord.Color(int(embed_data.get('color', 0x3498db)))
                            )
                            if embed_data.get('image'):
                                embed.set_image(url=embed_data['image'])
                            if embed_data.get('thumbnail'):
                                embed.set_thumbnail(url=embed_data['thumbnail'])
                            
                            await channel.send(embed=embed)
                        else:
                            # Anúncio simples
                            await channel.send(announcement['message'])
                        
                        completed.append(announcement)
                        bot_logger.info(f"Anúncio enviado no canal {channel.name}")
                    else:
                        completed.append(announcement)
                        
                except Exception as e:
                    bot_logger.error(f"Erro ao enviar anúncio: {e}")
                    completed.append(announcement)
        
        # Remover anúncios completados
        for announcement in completed:
            if announcement in self.scheduled_announcements:
                self.scheduled_announcements.remove(announcement)
        
        if completed:
            self.save_announcements()
    
    @check_reminders.before_loop
    @check_announcements.before_loop
    async def before_tasks(self):
        """Aguardar bot estar pronto"""
        await self.bot.wait_until_ready()
    
    def format_time_ago(self, timestamp):
        """Formatar tempo decorrido"""
        now = datetime.now().timestamp()
        diff = int(now - timestamp)
        
        if diff < 60:
            return f"{diff} segundos"
        elif diff < 3600:
            return f"{diff // 60} minutos"
        elif diff < 86400:
            return f"{diff // 3600} horas"
        else:
            return f"{diff // 86400} dias"
    
    # ==================== COMANDOS ====================
    
    @app_commands.command(
        name="lembrete",
        description="Criar um lembrete"
    )
    @app_commands.describe(
        tempo="Tempo até o lembrete (ex: 5m, 2h, 1d)",
        mensagem="Mensagem do lembrete",
        recorrente="Tornar este lembrete recorrente?"
    )
    async def reminder(
        self,
        interaction: discord.Interaction,
        tempo: str,
        mensagem: str,
        recorrente: bool = False
    ):
        """Criar lembrete"""
        # Parse do tempo
        time_units = {'s': 1, 'm': 60, 'h': 3600, 'd': 86400}
        
        try:
            unit = tempo[-1]
            value = int(tempo[:-1])
            
            if unit not in time_units:
                raise ValueError()
            
            seconds = value * time_units[unit]
            reminder_time = datetime.now().timestamp() + seconds
            
        except:
            await interaction.response.send_message(
                "❌ Formato de tempo inválido! Use: 5s, 10m, 2h, 1d",
                ephemeral=True
            )
            return
        
        # Criar lembrete
        reminder = {
            'user_id': str(interaction.user.id),
            'channel_id': str(interaction.channel.id),
            'message': mensagem,
            'time': reminder_time,
            'created_at': datetime.now().timestamp(),
            'recurring': recorrente,
            'interval': seconds if recorrente else 0
        }
        
        self.reminders.append(reminder)
        self.save_reminders()
        
        embed = discord.Embed(
            title="✅ Lembrete Criado!",
            description=f"**Mensagem:** {mensagem}\n"
                       f"**Tempo:** {tempo}\n"
                       f"**Recorrente:** {'Sim' if recorrente else 'Não'}",
            color=discord.Color.green(),
            timestamp=datetime.fromtimestamp(reminder_time)
        )
        embed.set_footer(text="Lembrete será enviado em")
        
        await interaction.response.send_message(embed=embed, ephemeral=True)
    
    @app_commands.command(
        name="poll",
        description="Criar uma votação/poll"
    )
    @app_commands.describe(
        pergunta="Pergunta da poll",
        opcoes="Opções separadas por | (ex: Sim | Não | Talvez)",
        descricao="Descrição adicional (opcional)"
    )
    async def poll(
        self,
        interaction: discord.Interaction,
        pergunta: str,
        opcoes: str,
        descricao: Optional[str] = None
    ):
        """Criar poll/votação"""
        options_list = [opt.strip() for opt in opcoes.split('|')]
        
        if len(options_list) < 2:
            await interaction.response.send_message(
                "❌ Precisas de pelo menos 2 opções!",
                ephemeral=True
            )
            return
        
        if len(options_list) > 5:
            await interaction.response.send_message(
                "❌ Máximo de 5 opções permitidas!",
                ephemeral=True
            )
            return
        
        # Emojis para as opções
        emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣']
        
        poll_id = ''.join(random.choices(string.ascii_letters + string.digits, k=8))
        
        poll_data = {
            'id': poll_id,
            'question': pergunta,
            'description': descricao or '',
            'options': [
                {
                    'text': opt,
                    'emoji': emojis[i],
                    'votes': 0
                }
                for i, opt in enumerate(options_list)
            ],
            'voters': set(),
            'created_by': str(interaction.user.id),
            'created_at': datetime.now().timestamp()
        }
        
        view = PollView(poll_data)
        embed = view.create_poll_embed()
        
        await interaction.response.send_message(embed=embed, view=view)
        
        # Guardar poll
        poll_save = poll_data.copy()
        poll_save['voters'] = list(poll_data['voters'])
        self.polls.append(poll_save)
        self.save_polls()
    
    @app_commands.command(
        name="anuncio",
        description="[ADMIN] Agendar um anúncio"
    )
    @app_commands.default_permissions(administrator=True)
    @app_commands.describe(
        canal="Canal onde enviar o anúncio",
        mensagem="Mensagem do anúncio",
        tempo="Quando enviar (ex: 5m, 2h, 1d, ou 'agora')"
    )
    async def announcement(
        self,
        interaction: discord.Interaction,
        canal: discord.TextChannel,
        mensagem: str,
        tempo: str = "agora"
    ):
        """Agendar anúncio"""
        if tempo.lower() == "agora":
            # Enviar imediatamente
            await canal.send(mensagem)
            await interaction.response.send_message(
                f"✅ Anúncio enviado em {canal.mention}!",
                ephemeral=True
            )
            return
        
        # Parse do tempo
        time_units = {'m': 60, 'h': 3600, 'd': 86400}
        
        try:
            unit = tempo[-1]
            value = int(tempo[:-1])
            
            if unit not in time_units:
                raise ValueError()
            
            seconds = value * time_units[unit]
            announcement_time = datetime.now().timestamp() + seconds
            
        except:
            await interaction.response.send_message(
                "❌ Formato de tempo inválido! Use: 5m, 2h, 1d ou 'agora'",
                ephemeral=True
            )
            return
        
        # Agendar anúncio
        announcement = {
            'channel_id': str(canal.id),
            'message': mensagem,
            'time': announcement_time,
            'created_by': str(interaction.user.id),
            'created_at': datetime.now().timestamp()
        }
        
        self.scheduled_announcements.append(announcement)
        self.save_announcements()
        
        await interaction.response.send_message(
            f"✅ Anúncio agendado para {canal.mention} daqui a {tempo}!",
            ephemeral=True
        )
    
    @app_commands.command(
        name="setup_autoroles",
        description="[ADMIN] Configurar painel de auto-roles"
    )
    @app_commands.default_permissions(administrator=True)
    async def setup_autoroles(self, interaction: discord.Interaction):
        """Configurar painel de auto-roles"""
        embed = discord.Embed(
            title="🎮 Roles Automáticas - EPA",
            description="**Clica nos botões abaixo para pegar nas tuas roles!**\n\n"
                       "━━━━━━━━━━━━━━━━━━━━━━\n\n"
                       "**🎮 Jogos:**\n"
                       "Seleciona os jogos que jogas para encontrares pessoas para jogar!\n\n"
                       "**💻 Plataformas:**\n"
                       "Indica em que plataformas jogas.\n\n"
                       "**💬 Mensagens Privadas:**\n"
                       "Define as tuas preferências de DM.",
            color=discord.Color.blue()
        )
        
        embed.add_field(
            name="ℹ️ Como Funciona",
            value="• Clica num botão para **pegar** a role\n"
                  "• Clica novamente para **remover** a role\n"
                  "• Podes ter quantas roles quiseres!",
            inline=False
        )
        
        embed.set_footer(text="EPA BOT • Sistema de Roles")
        
        if interaction.guild.icon:
            embed.set_thumbnail(url=interaction.guild.icon.url)
        
        await interaction.response.send_message(
            "✅ Painel configurado!",
            ephemeral=True
        )
        
        await interaction.channel.send(embed=embed, view=AutoRoleView())
        
        bot_logger.info(f"Painel de auto-roles criado por {interaction.user}")
    
    @app_commands.command(
        name="setup_verificacao",
        description="[ADMIN] Configurar sistema de verificação"
    )
    @app_commands.default_permissions(administrator=True)
    async def setup_verification(self, interaction: discord.Interaction):
        """Configurar sistema de verificação"""
        embed = discord.Embed(
            title="✅ Verificação - EPA",
            description="**Bem-vindo ao servidor EPA!**\n\n"
                       "Para teres acesso a todos os canais, precisas de te verificar.\n\n"
                       "━━━━━━━━━━━━━━━━━━━━━━\n\n"
                       "**Como funciona:**\n"
                       "1️⃣ Clica no botão **✅ Verificar** abaixo\n"
                       "2️⃣ Receberás a role de membro verificado\n"
                       "3️⃣ Terás acesso a todo o servidor!\n\n"
                       "**Depois de verificado:**\n"
                       "• Não te esqueças de pegar nas tuas roles em <#869989783856877618>\n"
                       "• Lê as regras do servidor\n"
                       "• Diverte-te!",
            color=discord.Color.green()
        )
        
        embed.set_footer(text="EPA BOT • Sistema de Verificação")
        
        if interaction.guild.icon:
            embed.set_thumbnail(url=interaction.guild.icon.url)
        
        await interaction.response.send_message(
            "✅ Sistema de verificação configurado!",
            ephemeral=True
        )
        
        await interaction.channel.send(embed=embed, view=VerificationView())
        
        bot_logger.info(f"Sistema de verificação criado por {interaction.user}")
    
    @app_commands.command(
        name="meus_lembretes",
        description="Ver os teus lembretes ativos"
    )
    async def my_reminders(self, interaction: discord.Interaction):
        """Ver lembretes do utilizador"""
        user_reminders = [r for r in self.reminders if r['user_id'] == str(interaction.user.id)]
        
        if not user_reminders:
            await interaction.response.send_message(
                "📭 Não tens lembretes ativos!",
                ephemeral=True
            )
            return
        
        embed = discord.Embed(
            title="⏰ Os Teus Lembretes",
            color=discord.Color.blue()
        )
        
        for i, reminder in enumerate(user_reminders[:10], 1):
            time_left = reminder['time'] - datetime.now().timestamp()
            
            if time_left > 0:
                if time_left < 60:
                    time_str = f"{int(time_left)}s"
                elif time_left < 3600:
                    time_str = f"{int(time_left / 60)}m"
                elif time_left < 86400:
                    time_str = f"{int(time_left / 3600)}h"
                else:
                    time_str = f"{int(time_left / 86400)}d"
                
                embed.add_field(
                    name=f"{i}. {reminder['message'][:50]}",
                    value=f"⏱️ Falta: {time_str} {'🔄' if reminder.get('recurring') else ''}",
                    inline=False
                )
        
        await interaction.response.send_message(embed=embed, ephemeral=True)


async def setup(bot):
    await bot.add_cog(UtilitiesAdvanced(bot))
