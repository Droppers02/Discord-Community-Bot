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


class GamesRoleView(discord.ui.View):
    """View para roles de jogos"""
    
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


class PlatformRoleView(discord.ui.View):
    """View para roles de plataformas"""
    
    def __init__(self):
        super().__init__(timeout=None)
    
    @discord.ui.button(
        label="🎮 PlayStation",
        style=discord.ButtonStyle.secondary,
        custom_id="role_ps"
    )
    async def ps(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, 869999110181249064)
    
    @discord.ui.button(
        label="🎮 Xbox",
        style=discord.ButtonStyle.secondary,
        custom_id="role_xbox"
    )
    async def xbox(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, 869999804556664862)
    
    @discord.ui.button(
        label="💻 PC",
        style=discord.ButtonStyle.secondary,
        custom_id="role_pc"
    )
    async def pc(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, 869999923452604476)
    
    @discord.ui.button(
        label="📱 Mobile",
        style=discord.ButtonStyle.secondary,
        custom_id="role_mobile"
    )
    async def mobile(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, 869999970894368818)
    
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


class DMPreferenceRoleView(discord.ui.View):
    """View para preferências de DM"""
    
    def __init__(self):
        super().__init__(timeout=None)
    
    @discord.ui.button(
        label="✅ Podem enviar DM",
        style=discord.ButtonStyle.secondary,
        custom_id="role_can_dm"
    )
    async def can_dm(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, 870000429788971009)
    
    @discord.ui.button(
        label="📩 Perguntar para DM",
        style=discord.ButtonStyle.secondary,
        custom_id="role_ask_dm"
    )
    async def ask_dm(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, 870000027962048632)
    
    @discord.ui.button(
        label="❌ Não enviar DM",
        style=discord.ButtonStyle.secondary,
        custom_id="role_no_dm"
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


class MathChallengeModal(discord.ui.Modal):
    """Modal para responder ao desafio matemático"""
    
    def __init__(self, correct_answer: int, verification_code: str, guild_id: int):
        super().__init__(title="🔢 Desafio Matemático")
        self.correct_answer = correct_answer
        self.verification_code = verification_code
        self.guild_id = guild_id
        
        self.answer = discord.ui.TextInput(
            label="Qual é o resultado?",
            placeholder="Digite apenas o número",
            required=True,
            max_length=5
        )
        self.add_item(self.answer)
    
    async def on_submit(self, interaction: discord.Interaction):
        try:
            user_answer = int(self.answer.value.strip())
        except ValueError:
            await interaction.response.send_message(
                "❌ Por favor, insere apenas números!",
                ephemeral=True
            )
            return
        
        if user_answer != self.correct_answer:
            await interaction.response.send_message(
                "❌ Resposta incorreta! Tenta novamente clicando no botão de verificação.",
                ephemeral=True
            )
            bot_logger.info(f"{interaction.user} falhou o desafio matemático")
            return
        
        # Fase 1 completa! Enviar código por DM
        try:
            dm_embed = discord.Embed(
                title="📧 Código de Verificação - Fase 2/2",
                description=f"**Parabéns!** Passaste na primeira fase.\n\n"
                           f"Aqui está o teu código de verificação:\n\n"
                           f"```\n{self.verification_code}\n```\n\n"
                           f"Volta ao servidor e introduz este código quando pedido.",
                color=discord.Color.blue(),
                timestamp=datetime.now()
            )
            dm_embed.set_footer(text="EPA BOT • Sistema de Verificação 2FA")
            
            await interaction.user.send(embed=dm_embed)
            
            # Mostrar modal para código
            code_modal = CodeVerificationModal(self.verification_code, self.guild_id)
            await interaction.response.send_modal(code_modal)
            
            bot_logger.info(f"{interaction.user} passou na fase 1 (matemática)")
            
        except discord.Forbidden:
            await interaction.response.send_message(
                "❌ Não consigo enviar-te DM! Ativa as mensagens privadas do servidor e tenta novamente.",
                ephemeral=True
            )
            bot_logger.warning(f"{interaction.user} tem DMs desativadas")


class CodeVerificationModal(discord.ui.Modal):
    """Modal para inserir o código de verificação"""
    
    def __init__(self, correct_code: str, guild_id: int):
        super().__init__(title="🔐 Código de Verificação")
        self.correct_code = correct_code
        self.guild_id = guild_id
        
        self.code = discord.ui.TextInput(
            label="Insere o código que recebeste por DM",
            placeholder="12345678",
            required=True,
            min_length=8,
            max_length=8
        )
        self.add_item(self.code)
    
    async def on_submit(self, interaction: discord.Interaction):
        user_code = self.code.value.strip()
        
        if user_code != self.correct_code:
            await interaction.response.send_message(
                "❌ Código incorreto! Verifica a tua DM e tenta novamente.",
                ephemeral=True
            )
            bot_logger.info(f"{interaction.user} inseriu código incorreto")
            return
        
        # Verificação completa! Dar role
        verified_role_id = 870001773648171178
        guild = interaction.client.get_guild(self.guild_id)
        
        if not guild:
            await interaction.response.send_message(
                "❌ Erro ao encontrar o servidor!",
                ephemeral=True
            )
            return
        
        verified_role = guild.get_role(verified_role_id)
        member = guild.get_member(interaction.user.id)
        
        if not verified_role or not member:
            await interaction.response.send_message(
                "❌ Erro ao verificar! Contacta um administrador.",
                ephemeral=True
            )
            return
        
        try:
            await member.add_roles(verified_role)
            
            success_embed = discord.Embed(
                title="✅ Verificação Concluída!",
                description=f"**Parabéns, {member.mention}!**\n\n"
                           f"✅ Passaste nas 2 fases de verificação\n"
                           f"✅ Tens agora acesso a todos os canais\n\n"
                           f"━━━━━━━━━━━━━━━━━━━━━━\n\n"
                           f"**Próximos passos:**\n"
                           f"• Pega nas tuas roles em <#869989783856877618>\n"
                           f"• Lê as regras do servidor\n"
                           f"• Diverte-te!",
                color=discord.Color.green(),
                timestamp=datetime.now()
            )
            success_embed.set_thumbnail(url=member.display_avatar.url)
            success_embed.set_footer(text="EPA BOT • Verificação 2FA Completa")
            
            await interaction.response.send_message(
                embed=success_embed,
                ephemeral=True
            )
            
            bot_logger.info(f"✅ {member} completou a verificação 2FA com sucesso")
            
        except discord.Forbidden:
            await interaction.response.send_message(
                "❌ Não tenho permissões para dar roles!",
                ephemeral=True
            )
        except Exception as e:
            bot_logger.error(f"Erro ao verificar {interaction.user}: {e}")
            await interaction.response.send_message(
                "❌ Ocorreu um erro! Contacta um administrador.",
                ephemeral=True
            )


class VerificationView(discord.ui.View):
    """View para iniciar verificação 2FA"""
    
    def __init__(self):
        super().__init__(timeout=None)
    
    @discord.ui.button(
        label="✅ Iniciar Verificação",
        style=discord.ButtonStyle.success,
        custom_id="verify_button",
        emoji="🔐"
    )
    async def verify(self, interaction: discord.Interaction, button: discord.ui.Button):
        """Iniciar processo de verificação 2FA"""
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
        
        # Gerar desafio matemático (soma ou subtração)
        operation = random.choice(['+', '-'])
        
        if operation == '+':
            num1 = random.randint(5, 50)
            num2 = random.randint(5, 50)
            correct_answer = num1 + num2
            question = f"{num1} + {num2}"
        else:
            num1 = random.randint(20, 80)
            num2 = random.randint(5, num1 - 5)
            correct_answer = num1 - num2
            question = f"{num1} - {num2}"
        
        # Gerar código de 8 dígitos
        verification_code = ''.join([str(random.randint(0, 9)) for _ in range(8)])
        
        # Mostrar desafio
        challenge_embed = discord.Embed(
            title="🔐 Verificação em 2 Fases - Fase 1/2",
            description=f"**Bem-vindo ao sistema de verificação!**\n\n"
                       f"Para garantir que és humano, resolve esta conta:\n\n"
                       f"**🔢 Quanto é `{question}`?**\n\n"
                       f"Clica abaixo para responder.",
            color=discord.Color.orange(),
            timestamp=datetime.now()
        )
        challenge_embed.add_field(
            name="📋 Processo",
            value="1️⃣ Resolve a conta matemática\n"
                  "2️⃣ Recebe código por DM (8 dígitos)\n"
                  "3️⃣ Insere o código para completar",
            inline=False
        )
        challenge_embed.set_footer(text="EPA BOT • Verificação 2FA")
        
        await interaction.response.send_message(
            embed=challenge_embed,
            ephemeral=True
        )
        
        # Enviar modal para resposta
        modal = MathChallengeModal(correct_answer, verification_code, interaction.guild.id)
        await interaction.followup.send("Clica no botão abaixo:", view=MathChallengeButton(modal), ephemeral=True)
        
        bot_logger.info(f"{member} iniciou verificação 2FA (desafio: {question} = {correct_answer})")


class MathChallengeButton(discord.ui.View):
    """View temporária com botão para abrir modal"""
    
    def __init__(self, modal: MathChallengeModal):
        super().__init__(timeout=300)
        self.modal = modal
    
    @discord.ui.button(label="📝 Responder", style=discord.ButtonStyle.primary)
    async def answer_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_modal(self.modal)


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
        self.bot.add_view(GamesRoleView())
        self.bot.add_view(PlatformRoleView())
        self.bot.add_view(DMPreferenceRoleView())
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
        
        # Painel 1: Jogos
        embed_games = discord.Embed(
            title="🎮 Roles de Jogos - EPA",
            description="**Clica nos botões abaixo para pegar nas roles dos jogos que jogas!**\n\n"
                       "Isto permite encontrares outras pessoas para jogar contigo.\n\n"
                       "━━━━━━━━━━━━━━━━━━━━━━\n\n"
                       "**ℹ️ Como Funciona:**\n"
                       "• Clica num botão para **pegar** a role\n"
                       "• Clica novamente para **remover** a role\n"
                       "• Podes ter quantas roles quiseres!",
            color=discord.Color.blue()
        )
        embed_games.set_footer(text="EPA BOT • Sistema de Roles - Jogos")
        if interaction.guild.icon:
            embed_games.set_thumbnail(url=interaction.guild.icon.url)
        
        # Painel 2: Plataformas
        embed_platforms = discord.Embed(
            title="💻 Roles de Plataformas - EPA",
            description="**Indica em que plataformas jogas!**\n\n"
                       "Isto ajuda a encontrar pessoas na mesma plataforma.\n\n"
                       "━━━━━━━━━━━━━━━━━━━━━━\n\n"
                       "**ℹ️ Como Funciona:**\n"
                       "• Clica num botão para **pegar** a role\n"
                       "• Clica novamente para **remover** a role\n"
                       "• Podes ter múltiplas plataformas!",
            color=discord.Color.green()
        )
        embed_platforms.set_footer(text="EPA BOT • Sistema de Roles - Plataformas")
        if interaction.guild.icon:
            embed_platforms.set_thumbnail(url=interaction.guild.icon.url)
        
        # Painel 3: Preferências DM
        embed_dm = discord.Embed(
            title="💬 Preferências de DM - EPA",
            description="**Define as tuas preferências de mensagens privadas!**\n\n"
                       "Isto ajuda outros membros a saberem se podem enviar-te DM.\n\n"
                       "━━━━━━━━━━━━━━━━━━━━━━\n\n"
                       "**ℹ️ Escolhe UMA opção:**\n"
                       "• **✅ Podem enviar DM** - Aceitas DMs de qualquer membro\n"
                       "• **📩 Perguntar para DM** - Pede primeiro antes de enviar\n"
                       "• **❌ Não enviar DM** - Não aceitas DMs",
            color=discord.Color.orange()
        )
        embed_dm.set_footer(text="EPA BOT • Sistema de Roles - DM")
        if interaction.guild.icon:
            embed_dm.set_thumbnail(url=interaction.guild.icon.url)
        
        await interaction.response.send_message(
            "✅ 3 painéis configurados! (Jogos, Plataformas, DM)",
            ephemeral=True
        )
        
        # Enviar os 3 painéis
        await interaction.channel.send(embed=embed_games, view=GamesRoleView())
        await interaction.channel.send(embed=embed_platforms, view=PlatformRoleView())
        await interaction.channel.send(embed=embed_dm, view=DMPreferenceRoleView())
        
        bot_logger.info(f"3 painéis de auto-roles criados por {interaction.user}")
    
    @app_commands.command(
        name="setup_verificacao",
        description="[ADMIN] Configurar sistema de verificação 2FA"
    )
    @app_commands.default_permissions(administrator=True)
    async def setup_verification(self, interaction: discord.Interaction):
        """Configurar sistema de verificação 2FA"""
        embed = discord.Embed(
            title="🔐 Verificação 2FA - EPA",
            description="**Bem-vindo ao servidor EPA!**\n\n"
                       "Para teres acesso a todos os canais, precisas de completar\n"
                       "o nosso sistema de verificação em **2 fases**.\n\n"
                       "━━━━━━━━━━━━━━━━━━━━━━\n\n"
                       "**📋 Como funciona:**\n\n"
                       "**Fase 1 - Desafio Matemático** 🔢\n"
                       "• Resolve uma conta simples (soma ou subtração)\n"
                       "• Isto confirma que és humano\n\n"
                       "**Fase 2 - Código de Verificação** 📧\n"
                       "• Recebe um código de 8 dígitos por DM\n"
                       "• Insere o código para completar a verificação\n\n"
                       "━━━━━━━━━━━━━━━━━━━━━━\n\n"
                       "**⚠️ Requisitos:**\n"
                       "• Tens que ter DMs ativas para receber o código\n"
                       "• O processo é rápido e seguro\n\n"
                       "**Depois de verificado:**\n"
                       "• Acesso total ao servidor\n"
                       "• Pega nas tuas roles em <#869989783856877618>\n"
                       "• Lê as regras e diverte-te!",
            color=discord.Color.green()
        )
        
        embed.set_footer(text="EPA BOT • Sistema de Verificação 2FA")
        
        if interaction.guild.icon:
            embed.set_thumbnail(url=interaction.guild.icon.url)
        
        await interaction.response.send_message(
            "✅ Sistema de verificação 2FA configurado!",
            ephemeral=True
        )
        
        await interaction.channel.send(embed=embed, view=VerificationView())
        
        bot_logger.info(f"Sistema de verificação 2FA criado por {interaction.user}")
    
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
