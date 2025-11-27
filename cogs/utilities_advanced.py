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
    
    def __init__(self, role_ids: dict):
        super().__init__(timeout=None)
        self.role_ids = role_ids
    
    @discord.ui.button(
        label="🎮 Gacha",
        style=discord.ButtonStyle.secondary,
        custom_id="role_gacha"
    )
    async def gacha(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, self.role_ids.get("gacha", 0))
    
    @discord.ui.button(
        label="🔫 CSGO",
        style=discord.ButtonStyle.secondary,
        custom_id="role_csgo"
    )
    async def csgo(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, self.role_ids.get("csgo", 0))
    
    @discord.ui.button(
        label="🎯 Valorant",
        style=discord.ButtonStyle.secondary,
        custom_id="role_valorant"
    )
    async def valorant(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, self.role_ids.get("valorant", 0))
    
    @discord.ui.button(
        label="🎮 Overwatch",
        style=discord.ButtonStyle.secondary,
        custom_id="role_overwatch"
    )
    async def overwatch(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, self.role_ids.get("overwatch", 0))
    
    @discord.ui.button(
        label="⚔️ League of Legends",
        style=discord.ButtonStyle.secondary,
        custom_id="role_lol"
    )
    async def lol(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, self.role_ids.get("lol", 0))
    
    @discord.ui.button(
        label="🎌 Anime",
        style=discord.ButtonStyle.secondary,
        custom_id="role_anime",
        row=1
    )
    async def anime(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, self.role_ids.get("anime", 0))
    
    @discord.ui.button(
        label="🦖 Ark",
        style=discord.ButtonStyle.secondary,
        custom_id="role_ark",
        row=1
    )
    async def ark(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, self.role_ids.get("ark", 0))
    
    @discord.ui.button(
        label="🃏 Runeterra",
        style=discord.ButtonStyle.secondary,
        custom_id="role_runeterra",
        row=1
    )
    async def runeterra(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, self.role_ids.get("runeterra", 0))
    
    @discord.ui.button(
        label="🚗 GTA V RP",
        style=discord.ButtonStyle.secondary,
        custom_id="role_gta",
        row=1
    )
    async def gta(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, self.role_ids.get("gta", 0))
    
    @discord.ui.button(
        label="🚀 Rocket League",
        style=discord.ButtonStyle.secondary,
        custom_id="role_rocket",
        row=1
    )
    async def rocket(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, self.role_ids.get("rocket_league", 0))
    
    @discord.ui.button(
        label="🦸 Marvel Rivals",
        style=discord.ButtonStyle.secondary,
        custom_id="role_marvel",
        row=2
    )
    async def marvel(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, self.role_ids.get("marvel_rivals", 0))
    
    @discord.ui.button(
        label="⛏️ Minecraft",
        style=discord.ButtonStyle.secondary,
        custom_id="role_minecraft",
        row=2
    )
    async def minecraft(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, self.role_ids.get("minecraft", 0))
    
    @discord.ui.button(
        label="🔪 Dead by Daylight",
        style=discord.ButtonStyle.secondary,
        custom_id="role_dbd",
        row=2
    )
    async def dbd(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, self.role_ids.get("dbd", 0))
    
    @discord.ui.button(
        label="🎮 Fortnite",
        style=discord.ButtonStyle.secondary,
        custom_id="role_fortnite",
        row=2
    )
    async def fortnite(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, self.role_ids.get("fortnite", 0))
    
    @discord.ui.button(
        label="🎨 Roblox",
        style=discord.ButtonStyle.secondary,
        custom_id="role_roblox",
        row=2
    )
    async def roblox(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, self.role_ids.get("roblox", 0))
    
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
    
    def __init__(self, role_ids: dict):
        super().__init__(timeout=None)
        self.role_ids = role_ids
    
    @discord.ui.button(
        label="🎮 PlayStation",
        style=discord.ButtonStyle.secondary,
        custom_id="role_ps"
    )
    async def ps(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, self.role_ids.get("playstation", 0))
    
    @discord.ui.button(
        label="🎮 Xbox",
        style=discord.ButtonStyle.secondary,
        custom_id="role_xbox"
    )
    async def xbox(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, self.role_ids.get("xbox", 0))
    
    @discord.ui.button(
        label="💻 PC",
        style=discord.ButtonStyle.secondary,
        custom_id="role_pc"
    )
    async def pc(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, self.role_ids.get("pc", 0))
    
    @discord.ui.button(
        label="📱 Mobile",
        style=discord.ButtonStyle.secondary,
        custom_id="role_mobile"
    )
    async def mobile(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, self.role_ids.get("mobile", 0))
    
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
    
    def __init__(self, role_ids: dict):
        super().__init__(timeout=None)
        self.role_ids = role_ids
    
    @discord.ui.button(
        label="✅ Podem enviar DM",
        style=discord.ButtonStyle.secondary,
        custom_id="role_can_dm"
    )
    async def can_dm(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, self.role_ids.get("can_dm", 0))
    
    @discord.ui.button(
        label="📩 Perguntar para DM",
        style=discord.ButtonStyle.secondary,
        custom_id="role_ask_dm"
    )
    async def ask_dm(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, self.role_ids.get("ask_dm", 0))
    
    @discord.ui.button(
        label="❌ Não enviar DM",
        style=discord.ButtonStyle.secondary,
        custom_id="role_no_dm"
    )
    async def no_dm(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self.toggle_role(interaction, self.role_ids.get("no_dm", 0))
    
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
        
        # Resposta correta! Enviar código por DM
        try:
            dm_embed = discord.Embed(
                title="📧 Código de Verificação - Fase 2/2",
                description=f"**Parabéns!** Passaste na primeira fase.\n\n"
                           f"Aqui está o teu código de verificação:\n\n"
                           f"```\n{self.verification_code}\n```\n\n"
                           f"**Agora clica no botão abaixo para inserir o código.**",
                color=discord.Color.blue()
            )
            dm_embed.set_footer(text="EPA BOT • Sistema de Verificação 2FA")
            
            await interaction.user.send(embed=dm_embed)
            
            # Criar view com botão para abrir o modal do código
            view = CodeInputView(self.verification_code, self.guild_id)
            
            await interaction.response.send_message(
                "✅ **Fase 1 completa!**\n\n"
                f"📧 Código enviado por DM!\n"
                f"🔐 Clica no botão abaixo para inserir o código:",
                view=view,
                ephemeral=True
            )
            
            bot_logger.info(f"{interaction.user} passou na fase 1 (matemática) - código enviado por DM")
            
        except discord.Forbidden:
            await interaction.response.send_message(
                "❌ Não consigo enviar-te DM! Ativa as mensagens privadas do servidor e tenta novamente.",
                ephemeral=True
            )
            bot_logger.warning(f"{interaction.user} tem DMs desativadas")
        except Exception as e:
            await interaction.response.send_message(
                f"❌ Erro inesperado: {str(e)}",
                ephemeral=True
            )
            bot_logger.error(f"Erro ao processar verificação de {interaction.user}: {e}")
    
    async def on_error(self, interaction: discord.Interaction, error: Exception):
        bot_logger.error(f"Erro no MathChallengeModal: {error}")
        if not interaction.response.is_done():
            await interaction.response.send_message(
                "❌ Ocorreu um erro! Tenta novamente.",
                ephemeral=True
            )


class CodeInputView(discord.ui.View):
    """View com botão para abrir modal do código"""
    
    def __init__(self, correct_code: str, guild_id: int):
        super().__init__(timeout=300)  # 5 minutos
        self.correct_code = correct_code
        self.guild_id = guild_id
    
    @discord.ui.button(
        label="🔐 Inserir Código",
        style=discord.ButtonStyle.primary,
        emoji="🔐"
    )
    async def input_code(self, interaction: discord.Interaction, button: discord.ui.Button):
        """Abrir modal para inserir código"""
        code_modal = CodeVerificationModal(self.correct_code, self.guild_id)
        await interaction.response.send_modal(code_modal)


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
        # Carregar config para obter verified_role_id
        try:
            with open("config/utilities_config.json", 'r', encoding='utf-8') as f:
                config = json.load(f)
            verified_role_id = config.get("verification", {}).get("verified_role_id", 0)
        except:
            verified_role_id = 0
        
        if verified_role_id == 0:
            await interaction.response.send_message(
                "❌ Sistema de verificação não configurado! Contacta um administrador.",
                ephemeral=True
            )
            return
        
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
            bot_logger.info(f"🔍 [2FA] {member} prestes a receber role de verificado (ID: {verified_role_id})")
            bot_logger.info(f"🔍 [2FA] Roles antes de adicionar: {[role.name for role in member.roles]}")
            
            await member.add_roles(verified_role, reason="Verificação 2FA completa")
            
            # Verificar se a role foi realmente adicionada
            await asyncio.sleep(1)
            member_refreshed = await guild.fetch_member(member.id)
            has_role = verified_role in member_refreshed.roles
            
            bot_logger.info(f"✅ [2FA] add_roles() executado para {member}")
            bot_logger.info(f"🔍 [2FA] Roles após adicionar (verificado): {[role.name for role in member_refreshed.roles]}")
            bot_logger.info(f"🔍 [2FA] Tem a role '{verified_role.name}'? {has_role}")
            
            # Obter canal de autoroles da config
            autoroles_channel_id = config.get("channels", {}).get("autoroles_channel", 0)
            autoroles_mention = f"<#{autoroles_channel_id}>" if autoroles_channel_id else "o canal de roles"
            
            success_embed = discord.Embed(
                title="✅ Verificação Concluída!",
                description=f"**Parabéns, {member.mention}!**\n\n"
                           f"✅ Passaste nas 2 fases de verificação\n"
                           f"✅ Tens agora acesso a todos os canais\n\n"
                           f"━━━━━━━━━━━━━━━━━━━━━━\n\n"
                           f"**Próximos passos:**\n"
                           f"• Pega nas tuas roles em {autoroles_mention}\n"
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
    
    def __init__(self, config: dict):
        super().__init__(timeout=None)
        self.config = config
    
    @discord.ui.button(
        label="✅ Iniciar Verificação",
        style=discord.ButtonStyle.success,
        custom_id="verify_button",
        emoji="🔐"
    )
    async def verify(self, interaction: discord.Interaction, button: discord.ui.Button):
        """Iniciar processo de verificação 2FA"""
        # Obter verified_role_id da configuração
        verified_role_id = self.config.get("verification", {}).get("verified_role_id", 0)
        
        if verified_role_id == 0:
            await interaction.response.send_message(
                "❌ Sistema de verificação não configurado! Configure utilities_config.json",
                ephemeral=True
            )
            return
        
        verified_role = interaction.guild.get_role(verified_role_id)
        
        if not verified_role:
            await interaction.response.send_message(
                "❌ Role de verificado não encontrada!",
                ephemeral=True
            )
            bot_logger.error(f"❌ [2FA] Role {verified_role_id} não encontrada no servidor")
            return
        
        # Responder imediatamente para não dar timeout
        await interaction.response.defer(ephemeral=True)
        
        bot_logger.info(f"🔍 [2FA] {interaction.user} clicou no botão de verificação")
        
        # Verificar se já tem a role (verificação inicial rápida)
        member = interaction.user
        if verified_role in member.roles:
            bot_logger.info(f"⚠️ [2FA] {member} já tem a role '{verified_role.name}'. Removendo...")
            try:
                await member.remove_roles(verified_role, reason="Iniciou verificação 2FA - role será restaurada após completar")
                bot_logger.info(f"✅ [2FA] Role '{verified_role.name}' removida de {member}")
                await interaction.followup.send(
                    "⚠️ Role de membro removida! Complete a verificação para a recuperar.",
                    ephemeral=True
                )
                # Aguardar para a remoção ser aplicada
                await asyncio.sleep(1)
            except discord.Forbidden:
                await interaction.followup.send(
                    "❌ Não tenho permissões para remover roles!",
                    ephemeral=True
                )
                bot_logger.error(f"❌ [2FA] Sem permissões para remover role de {member}")
                return
            except Exception as e:
                bot_logger.error(f"❌ [2FA] Erro ao remover role: {e}")
                await interaction.followup.send(
                    "❌ Erro ao processar verificação. Tenta novamente.",
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
        
        await interaction.followup.send(
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
    
    # Definir grupos de comandos
    nota_group = app_commands.Group(name="nota", description="📝 Sistema de notas pessoais")
    voz_group = app_commands.Group(name="voz", description="🎤 Estatísticas de voz")
    sugestao_group = app_commands.Group(name="sugestao", description="💡 Sistema de sugestões")
    
    def __init__(self, bot):
        self.bot = bot
        self.reminders_file = "data/reminders.json"
        self.polls_file = "data/polls.json"
        self.scheduled_announcements_file = "data/scheduled_announcements.json"
        self.config_file = "config/utilities_config.json"
        
        # Tracking de voz
        self.voice_sessions = {}  # {user_id: {'join_time': datetime, 'channel_id': int}}
        
        # Carregar configuração
        self.load_config()
        
        self.ensure_data_files()
        self.load_data()
        
        # Iniciar tasks
        self.check_reminders.start()
        self.check_announcements.start()
        self.check_giveaways.start()
    
    def load_config(self):
        """Carregar configuração de IDs"""
        try:
            with open(self.config_file, 'r', encoding='utf-8') as f:
                self.config = json.load(f)
            bot_logger.info("✅ Configuração de utilidades carregada")
        except FileNotFoundError:
            bot_logger.error(f"❌ Arquivo {self.config_file} não encontrado!")
            # Configuração padrão vazia
            self.config = {
                "verification": {"verified_role_id": 0},
                "autoroles": {
                    "games": {},
                    "platforms": {},
                    "dm_preferences": {}
                },
                "channels": {},
                "messages": {}
            }
        except json.JSONDecodeError as e:
            bot_logger.error(f"❌ Erro ao ler {self.config_file}: {e}")
            self.config = {
                "verification": {"verified_role_id": 0},
                "autoroles": {
                    "games": {},
                    "platforms": {},
                    "dm_preferences": {}
                },
                "channels": {},
                "messages": {}
            }
    
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
        # Carregar views com IDs da configuração
        games_ids = self.config.get("autoroles", {}).get("games", {})
        platform_ids = self.config.get("autoroles", {}).get("platforms", {})
        dm_ids = self.config.get("autoroles", {}).get("dm_preferences", {})
        
        self.bot.add_view(GamesRoleView(games_ids))
        self.bot.add_view(PlatformRoleView(platform_ids))
        self.bot.add_view(DMPreferenceRoleView(dm_ids))
        self.bot.add_view(VerificationView(self.config))
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
        
        # Remover anúncios completados da lista
        for announcement in completed:
            if announcement in self.scheduled_announcements:
                self.scheduled_announcements.remove(announcement)
        
        if completed:
            self.save_announcements()
    
    @tasks.loop(minutes=1)
    async def check_giveaways(self):
        """Verificar giveaways que devem terminar"""
        import aiosqlite
        
        now = datetime.utcnow()
        
        async with aiosqlite.connect(self.bot.db.db_path) as db:
            cursor = await db.execute("""
                SELECT message_id, guild_id
                FROM giveaways
                WHERE status = 'active' AND datetime(ends_at) <= datetime('now')
            """)
            rows = await cursor.fetchall()
            
            for message_id, guild_id in rows:
                await self.end_giveaway(int(message_id), int(guild_id))
    
    @check_reminders.before_loop
    @check_announcements.before_loop
    @check_giveaways.before_loop
    async def before_tasks(self):
        """Aguardar bot estar pronto"""
        await self.bot.wait_until_ready()
    
    # ===== EVENT LISTENERS =====
    
    @commands.Cog.listener()
    async def on_message(self, message):
        """Listener para AFK system"""
        if message.author.bot:
            return
        
        import aiosqlite
        
        # Verificar se autor está AFK e remover
        async with aiosqlite.connect(self.bot.db.db_path) as db:
            cursor = await db.execute("""
                SELECT reason, set_at FROM afk_status
                WHERE user_id = ? AND guild_id = ?
            """, (str(message.author.id), str(message.guild.id)))
            row = await cursor.fetchone()
            
            if row:
                reason, set_at = row
                # Remover AFK
                await db.execute("""
                    DELETE FROM afk_status
                    WHERE user_id = ? AND guild_id = ?
                """, (str(message.author.id), str(message.guild.id)))
                await db.commit()
                
                # Calcular tempo AFK
                try:
                    afk_start = datetime.fromisoformat(set_at)
                    duration = datetime.utcnow() - afk_start
                    duration_str = self.format_duration(duration)
                    
                    await message.channel.send(
                        f"👋 Bem-vindo de volta {message.author.mention}! "
                        f"Estiveste AFK por **{duration_str}**.",
                        delete_after=5
                    )
                except:
                    await message.channel.send(
                        f"👋 Bem-vindo de volta {message.author.mention}!",
                        delete_after=5
                    )
        
        # Verificar se alguém mencionado está AFK
        if message.mentions:
            async with aiosqlite.connect(self.bot.db.db_path) as db:
                for mentioned_user in message.mentions:
                    if mentioned_user.bot:
                        continue
                    
                    cursor = await db.execute("""
                        SELECT reason, set_at FROM afk_status
                        WHERE user_id = ? AND guild_id = ?
                    """, (str(mentioned_user.id), str(message.guild.id)))
                    row = await cursor.fetchone()
                    
                    if row:
                        reason, set_at = row
                        try:
                            afk_start = datetime.fromisoformat(set_at)
                            duration = datetime.utcnow() - afk_start
                            duration_str = self.format_duration(duration)
                            
                            await message.channel.send(
                                f"💤 {mentioned_user.display_name} está AFK há **{duration_str}**: {reason}",
                                delete_after=10
                            )
                        except:
                            await message.channel.send(
                                f"💤 {mentioned_user.display_name} está AFK: {reason}",
                                delete_after=10
                            )
    
    @commands.Cog.listener()
    async def on_raw_reaction_add(self, payload):
        """Listener para Starboard"""
        if payload.member.bot:
            return
        
        # Verificar configuração do starboard
        starboard_config = self.config.get('starboard', {})
        if not starboard_config.get('enabled', False):
            return
        
        star_emoji = starboard_config.get('emoji', '⭐')
        if str(payload.emoji) != star_emoji:
            return
        
        import aiosqlite
        guild = self.bot.get_guild(payload.guild_id)
        channel = guild.get_channel(payload.channel_id)
        
        try:
            message = await channel.fetch_message(payload.message_id)
        except:
            return
        
        # Verificar se autor está reagindo à própria mensagem
        if not starboard_config.get('self_star', False) and payload.user_id == message.author.id:
            try:
                await message.remove_reaction(star_emoji, payload.member)
            except:
                pass
            return
        
        # Contar reações
        reaction = discord.utils.get(message.reactions, emoji=star_emoji)
        if not reaction:
            return
        
        star_count = reaction.count
        threshold = starboard_config.get('star_threshold', 3)
        
        if star_count >= threshold:
            await self.add_to_starboard(message, star_count, guild)
    
    async def add_to_starboard(self, message, star_count, guild):
        """Adicionar mensagem ao starboard"""
        import aiosqlite
        
        starboard_config = self.config.get('starboard', {})
        starboard_channel_id = starboard_config.get('channel_id', 0)
        
        if starboard_channel_id == 0:
            return
        
        starboard_channel = guild.get_channel(starboard_channel_id)
        if not starboard_channel:
            return
        
        # Verificar se já está no starboard
        async with aiosqlite.connect(self.bot.db.db_path) as db:
            cursor = await db.execute("""
                SELECT id, starboard_message_id, star_count
                FROM starboard
                WHERE message_id = ? AND guild_id = ?
            """, (str(message.id), str(guild.id)))
            row = await cursor.fetchone()
            
            star_emoji = starboard_config.get('emoji', '⭐')
            
            # Criar embed
            embed = discord.Embed(
                description=message.content or "*[Sem conteúdo de texto]*",
                color=discord.Color.gold(),
                timestamp=message.created_at
            )
            embed.set_author(
                name=message.author.display_name,
                icon_url=message.author.display_avatar.url
            )
            embed.add_field(
                name="Link",
                value=f"[Ir para mensagem]({message.jump_url})",
                inline=False
            )
            
            # Adicionar imagens
            if message.attachments:
                embed.set_image(url=message.attachments[0].url)
                if len(message.attachments) > 1:
                    embed.set_footer(text=f"+{len(message.attachments)-1} anexos adicionais")
            
            content = f"{star_emoji} **{star_count}** | {message.channel.mention}"
            
            if row:
                # Atualizar mensagem existente
                starboard_id, starboard_msg_id, old_count = row
                
                if starboard_msg_id:
                    try:
                        starboard_msg = await starboard_channel.fetch_message(int(starboard_msg_id))
                        await starboard_msg.edit(content=content, embed=embed)
                        
                        await db.execute("""
                            UPDATE starboard
                            SET star_count = ?
                            WHERE id = ?
                        """, (star_count, starboard_id))
                        await db.commit()
                    except discord.NotFound:
                        pass
            else:
                # Criar nova entrada
                starboard_msg = await starboard_channel.send(content=content, embed=embed)
                
                # Salvar attachments
                attachment_urls = json.dumps([att.url for att in message.attachments]) if message.attachments else None
                
                await db.execute("""
                    INSERT INTO starboard 
                    (guild_id, message_id, channel_id, author_id, starboard_message_id, star_count, content, attachment_urls, starred_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """, (
                    str(guild.id),
                    str(message.id),
                    str(message.channel.id),
                    str(message.author.id),
                    str(starboard_msg.id),
                    star_count,
                    message.content,
                    attachment_urls
                ))
                await db.commit()
    
    @commands.Cog.listener()
    async def on_voice_state_update(self, member, before, after):
        """Listener para Voice Tracker"""
        if member.bot:
            return
        
        voice_config = self.config.get('voice_tracker', {})
        if not voice_config.get('enabled', True):
            return
        
        import aiosqlite
        
        # Membro entrou em canal de voz
        if before.channel is None and after.channel is not None:
            self.voice_sessions[member.id] = {
                'join_time': datetime.utcnow(),
                'channel_id': after.channel.id
            }
            bot_logger.info(f"{member} entrou em {after.channel.name}")
        
        # Membro saiu de canal de voz
        elif before.channel is not None and after.channel is None:
            if member.id in self.voice_sessions:
                session = self.voice_sessions.pop(member.id)
                join_time = session['join_time']
                channel_id = session['channel_id']
                
                duration = int((datetime.utcnow() - join_time).total_seconds())
                min_session_time = voice_config.get('min_session_time', 60)
                
                # Só salvar se duração >= mínimo
                if duration >= min_session_time:
                    async with aiosqlite.connect(self.bot.db.db_path) as db:
                        # Salvar sessão
                        date_str = join_time.strftime('%Y-%m-%d')
                        await db.execute("""
                            INSERT INTO voice_stats 
                            (user_id, guild_id, channel_id, join_time, leave_time, duration, date)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        """, (
                            str(member.id),
                            str(member.guild.id),
                            str(channel_id),
                            join_time.isoformat(),
                            datetime.utcnow().isoformat(),
                            duration,
                            date_str
                        ))
                        
                        # Atualizar totais
                        await db.execute("""
                            INSERT INTO voice_totals (user_id, guild_id, total_time, sessions_count, last_session)
                            VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
                            ON CONFLICT(user_id, guild_id) DO UPDATE SET
                                total_time = total_time + ?,
                                sessions_count = sessions_count + 1,
                                last_session = CURRENT_TIMESTAMP
                        """, (
                            str(member.id),
                            str(member.guild.id),
                            duration,
                            duration
                        ))
                        
                        await db.commit()
                    
                    bot_logger.info(f"{member} saiu de canal de voz - Duração: {duration}s")
        
        # Membro mudou de canal (contar como saída + entrada)
        elif before.channel is not None and after.channel is not None and before.channel.id != after.channel.id:
            if member.id in self.voice_sessions:
                # Processar saída do canal anterior
                session = self.voice_sessions[member.id]
                join_time = session['join_time']
                channel_id = session['channel_id']
                
                duration = int((datetime.utcnow() - join_time).total_seconds())
                min_session_time = voice_config.get('min_session_time', 60)
                
                if duration >= min_session_time:
                    async with aiosqlite.connect(self.bot.db.db_path) as db:
                        date_str = join_time.strftime('%Y-%m-%d')
                        await db.execute("""
                            INSERT INTO voice_stats 
                            (user_id, guild_id, channel_id, join_time, leave_time, duration, date)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        """, (
                            str(member.id),
                            str(member.guild.id),
                            str(channel_id),
                            join_time.isoformat(),
                            datetime.utcnow().isoformat(),
                            duration,
                            date_str
                        ))
                        
                        await db.execute("""
                            INSERT INTO voice_totals (user_id, guild_id, total_time, sessions_count, last_session)
                            VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
                            ON CONFLICT(user_id, guild_id) DO UPDATE SET
                                total_time = total_time + ?,
                                sessions_count = sessions_count + 1,
                                last_session = CURRENT_TIMESTAMP
                        """, (
                            str(member.id),
                            str(member.guild.id),
                            duration,
                            duration
                        ))
                        
                        await db.commit()
                
                # Registrar entrada no novo canal
                self.voice_sessions[member.id] = {
                    'join_time': datetime.utcnow(),
                    'channel_id': after.channel.id
                }
    
    def format_duration(self, duration):
        """Formatar duração para texto legível"""
        total_seconds = int(duration.total_seconds())
        
        days = total_seconds // 86400
        hours = (total_seconds % 86400) // 3600
        minutes = (total_seconds % 3600) // 60
        seconds = total_seconds % 60
        
        parts = []
        if days > 0:
            parts.append(f"{days}d")
        if hours > 0:
            parts.append(f"{hours}h")
        if minutes > 0:
            parts.append(f"{minutes}m")
        if seconds > 0 and not parts:  # Só mostrar segundos se for muito curto
            parts.append(f"{seconds}s")
        
        return " ".join(parts) if parts else "0s"
    
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
        name="anuncios_fila",
        description="[ADMIN] Ver anúncios agendados"
    )
    @app_commands.default_permissions(administrator=True)
    async def announcements_queue(self, interaction: discord.Interaction):
        """Ver fila de anúncios agendados"""
        if not self.scheduled_announcements:
            await interaction.response.send_message(
                "📭 Não há anúncios agendados.",
                ephemeral=True
            )
            return
        
        embed = discord.Embed(
            title="📢 Anúncios Agendados",
            description=f"Total: {len(self.scheduled_announcements)} anúncio(s)",
            color=discord.Color.blue()
        )
        
        for i, announcement in enumerate(self.scheduled_announcements, 1):
            channel = self.bot.get_channel(int(announcement['channel_id']))
            channel_mention = channel.mention if channel else f"<#{announcement['channel_id']}>"
            
            # Calcular tempo restante
            time_left = announcement['time'] - datetime.now().timestamp()
            
            if time_left > 0:
                hours = int(time_left // 3600)
                minutes = int((time_left % 3600) // 60)
                time_str = f"🕒 Em {hours}h {minutes}m"
            else:
                time_str = "⏰ Atrasado (será enviado em breve)"
            
            # Preview da mensagem (primeiros 100 chars)
            message_preview = announcement['message'][:100]
            if len(announcement['message']) > 100:
                message_preview += "..."
            
            embed.add_field(
                name=f"#{i} - {channel_mention}",
                value=f"{time_str}\n```{message_preview}```",
                inline=False
            )
        
        embed.set_footer(text="Use /cancelar_anuncio <número> para cancelar")
        await interaction.response.send_message(embed=embed, ephemeral=True)
    
    @app_commands.command(
        name="cancelar_anuncio",
        description="[ADMIN] Cancelar anúncio agendado"
    )
    @app_commands.default_permissions(administrator=True)
    @app_commands.describe(numero="Número do anúncio na fila")
    async def cancel_announcement(self, interaction: discord.Interaction, numero: int):
        """Cancelar anúncio agendado"""
        if numero < 1 or numero > len(self.scheduled_announcements):
            await interaction.response.send_message(
                f"❌ Número inválido! Use /anuncios_fila para ver os números.",
                ephemeral=True
            )
            return
        
        # Remover anúncio
        removed = self.scheduled_announcements.pop(numero - 1)
        self.save_announcements()
        
        channel = self.bot.get_channel(int(removed['channel_id']))
        channel_name = channel.mention if channel else f"<#{removed['channel_id']}>"
        
        await interaction.response.send_message(
            f"✅ Anúncio #{numero} para {channel_name} cancelado!",
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
        
        # Enviar os 3 painéis com IDs da configuração
        games_ids = self.config.get("autoroles", {}).get("games", {})
        platform_ids = self.config.get("autoroles", {}).get("platforms", {})
        dm_ids = self.config.get("autoroles", {}).get("dm_preferences", {})
        
        await interaction.channel.send(embed=embed_games, view=GamesRoleView(games_ids))
        await interaction.channel.send(embed=embed_platforms, view=PlatformRoleView(platform_ids))
        await interaction.channel.send(embed=embed_dm, view=DMPreferenceRoleView(dm_ids))
        
        bot_logger.info(f"3 painéis de auto-roles criados por {interaction.user}")
    
    @app_commands.command(
        name="setup_verificacao",
        description="[ADMIN] Configurar sistema de verificação 2FA"
    )
    @app_commands.default_permissions(administrator=True)
    async def setup_verification(self, interaction: discord.Interaction):
        """Configurar sistema de verificação 2FA"""
        # Obter canal de autoroles da config
        autoroles_channel_id = self.config.get("channels", {}).get("autoroles_channel", 0)
        autoroles_mention = f"<#{autoroles_channel_id}>" if autoroles_channel_id else "o canal de roles"
        
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
                       f"• Pega nas tuas roles em {autoroles_mention}\n"
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
        
        await interaction.channel.send(embed=embed, view=VerificationView(self.config))
        
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
    
    # COMANDO DE DEBUG - DESATIVADO PARA ECONOMIZAR SLOTS
    # Use bot owner commands ou terminal para sincronizar
    # @app_commands.command(name="sync", description="🔄 Sincronizar comandos slash (Apenas Donos)")
    async def sync_commands_disabled(self, interaction: discord.Interaction, modo: str = "global"):
        """Sincronizar comandos slash manualmente"""
        
        # Verificar se é dono do bot
        owner_ids = self.bot.config.owner_ids or []
        if interaction.user.id not in owner_ids:
            await interaction.response.send_message(
                "❌ Apenas os donos do bot podem usar este comando!",
                ephemeral=True
            )
            return
        
        await interaction.response.defer(ephemeral=True)
        
        try:
            guild = interaction.guild
            
            if modo == "global":
                # Sincronizar comandos globalmente
                synced = await self.bot.tree.sync()
                await interaction.followup.send(
                    f"✅ Sincronizados **{len(synced)}** comandos GLOBALMENTE!\n"
                    f"⏰ Estarão disponíveis em até 1h em todos os servidores.",
                    ephemeral=True
                )
                bot_logger.info(f"Comandos globais sincronizados por {interaction.user} - {len(synced)} comandos")
                
            elif modo == "clear_guild":
                # Limpar comandos do servidor
                self.bot.tree.clear_commands(guild=guild)
                synced = await self.bot.tree.sync(guild=guild)
                await interaction.followup.send(
                    f"✅ Comandos do servidor limpos!\n"
                    f"⚡ Use modo 'Servidor Atual' para adicionar comandos novamente.",
                    ephemeral=True
                )
                bot_logger.info(f"Comandos do servidor limpos por {interaction.user}")
                
            else:  # guild
                # Copiar comandos globais para o servidor atual
                self.bot.tree.copy_global_to(guild=guild)
                synced = await self.bot.tree.sync(guild=guild)
                
                await interaction.followup.send(
                    f"✅ Sincronizados **{len(synced)}** comandos para ESTE servidor!\n"
                    f"⚡ Disponíveis **IMEDIATAMENTE**!",
                    ephemeral=True
                )
                bot_logger.info(f"Comandos sincronizados para servidor por {interaction.user} - {len(synced)} comandos")
            
        except Exception as e:
            await interaction.followup.send(
                f"❌ Erro ao sincronizar: {e}",
                ephemeral=True
            )
            bot_logger.error(f"Erro ao sincronizar comandos: {e}")
    
    # ===== SISTEMA DE SUGESTÕES DA COMUNIDADE =====
    
    @app_commands.command(
        name="suggest",
        description="📝 Criar uma sugestão para a comunidade"
    )
    @app_commands.describe(
        sugestao="Descreve a tua sugestão"
    )
    async def suggest(self, interaction: discord.Interaction, sugestao: str):
        """Criar sugestão com sistema de upvote/downvote"""
        
        if len(sugestao) < 10:
            await interaction.response.send_message(
                "❌ A sugestão deve ter pelo menos 10 caracteres!",
                ephemeral=True
            )
            return
        
        # Obter canal de sugestões do config
        import json
        with open('config/utilities_config.json', 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        channel_id = config.get('suggestions', {}).get('channel_id', 0)
        if channel_id == 0:
            await interaction.response.send_message(
                "❌ O sistema de sugestões não está configurado neste servidor!\n"
                "Um administrador precisa configurar o canal de sugestões.",
                ephemeral=True
            )
            return
        
        channel = interaction.guild.get_channel(channel_id)
        if not channel:
            await interaction.response.send_message(
                "❌ Canal de sugestões não encontrado!",
                ephemeral=True
            )
            return
        
        # Criar embed da sugestão
        embed = discord.Embed(
            title="💡 Nova Sugestão",
            description=sugestao,
            color=discord.Color.blue(),
            timestamp=datetime.utcnow()
        )
        embed.set_author(
            name=f"{interaction.user.display_name}",
            icon_url=interaction.user.display_avatar.url
        )
        embed.add_field(name="👍 Upvotes", value="0", inline=True)
        embed.add_field(name="👎 Downvotes", value="0", inline=True)
        embed.add_field(name="📊 Status", value="🔄 Pendente", inline=True)
        embed.set_footer(text=f"ID do Utilizador: {interaction.user.id}")
        
        # Enviar para canal de sugestões
        msg = await channel.send(embed=embed)
        await msg.add_reaction("👍")
        await msg.add_reaction("👎")
        
        # Salvar na database
        import aiosqlite
        async with aiosqlite.connect(self.bot.db.db_path) as db:
            await db.execute("""
                INSERT INTO suggestions (guild_id, user_id, channel_id, message_id, suggestion, status)
                VALUES (?, ?, ?, ?, ?, 'pending')
            """, (str(interaction.guild.id), str(interaction.user.id), str(channel.id), str(msg.id), sugestao))
            await db.commit()
        
        await interaction.response.send_message(
            f"✅ Sugestão criada com sucesso em {channel.mention}!",
            ephemeral=True
        )
        bot_logger.info(f"Sugestão criada por {interaction.user} em {interaction.guild}")
    
    @sugestao_group.command(
        name="aprovar",
        description="✅ Aprovar uma sugestão (Moderadores)"
    )
    @app_commands.describe(
        suggestion_id="ID da sugestão (número da mensagem)",
        nota="Nota de aprovação (opcional)"
    )
    @app_commands.checks.has_permissions(manage_guild=True)
    async def approve_suggestion(self, interaction: discord.Interaction, suggestion_id: str, nota: str = None):
        """Aprovar sugestão"""
        
        import aiosqlite
        async with aiosqlite.connect(self.bot.db.db_path) as db:
            cursor = await db.execute("""
                SELECT channel_id, message_id, suggestion, user_id 
                FROM suggestions 
                WHERE message_id = ? AND guild_id = ?
            """, (suggestion_id, str(interaction.guild.id)))
            row = await cursor.fetchone()
            
            if not row:
                await interaction.response.send_message(
                    "❌ Sugestão não encontrada!",
                    ephemeral=True
                )
                return
            
            channel_id, message_id, suggestion, user_id = row
            channel = interaction.guild.get_channel(int(channel_id))
            
            try:
                msg = await channel.fetch_message(int(message_id))
                
                # Atualizar embed
                embed = msg.embeds[0]
                embed.color = discord.Color.green()
                embed.remove_field(2)  # Remover status antigo
                embed.add_field(
                    name="📊 Status", 
                    value=f"✅ Aprovada por {interaction.user.mention}", 
                    inline=True
                )
                if nota:
                    embed.add_field(name="📝 Nota", value=nota, inline=False)
                
                await msg.edit(embed=embed)
                
                # Atualizar database
                await db.execute("""
                    UPDATE suggestions 
                    SET status = 'approved', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_note = ?
                    WHERE message_id = ?
                """, (str(interaction.user.id), nota, suggestion_id))
                await db.commit()
                
                # Notificar autor
                try:
                    author = await interaction.guild.fetch_member(int(user_id))
                    await author.send(
                        f"✅ A tua sugestão foi aprovada!\n\n**Sugestão:** {suggestion}\n"
                        f"**Aprovada por:** {interaction.user.mention}\n"
                        f"{'**Nota:** ' + nota if nota else ''}"
                    )
                except:
                    pass
                
                await interaction.response.send_message(
                    "✅ Sugestão aprovada com sucesso!",
                    ephemeral=True
                )
                
            except discord.NotFound:
                await interaction.response.send_message(
                    "❌ Mensagem da sugestão não encontrada!",
                    ephemeral=True
                )
    
    @sugestao_group.command(
        name="negar",
        description="❌ Recusar uma sugestão (Moderadores)"
    )
    @app_commands.describe(
        suggestion_id="ID da sugestão (número da mensagem)",
        razao="Razão da recusa"
    )
    @app_commands.checks.has_permissions(manage_guild=True)
    async def deny_suggestion(self, interaction: discord.Interaction, suggestion_id: str, razao: str = "Não especificada"):
        """Recusar sugestão"""
        
        import aiosqlite
        async with aiosqlite.connect(self.bot.db.db_path) as db:
            cursor = await db.execute("""
                SELECT channel_id, message_id, suggestion, user_id 
                FROM suggestions 
                WHERE message_id = ? AND guild_id = ?
            """, (suggestion_id, str(interaction.guild.id)))
            row = await cursor.fetchone()
            
            if not row:
                await interaction.response.send_message(
                    "❌ Sugestão não encontrada!",
                    ephemeral=True
                )
                return
            
            channel_id, message_id, suggestion, user_id = row
            channel = interaction.guild.get_channel(int(channel_id))
            
            try:
                msg = await channel.fetch_message(int(message_id))
                
                # Atualizar embed
                embed = msg.embeds[0]
                embed.color = discord.Color.red()
                embed.remove_field(2)  # Remover status antigo
                embed.add_field(
                    name="📊 Status", 
                    value=f"❌ Recusada por {interaction.user.mention}", 
                    inline=True
                )
                embed.add_field(name="📝 Razão", value=razao, inline=False)
                
                await msg.edit(embed=embed)
                
                # Atualizar database
                await db.execute("""
                    UPDATE suggestions 
                    SET status = 'denied', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_note = ?
                    WHERE message_id = ?
                """, (str(interaction.user.id), razao, suggestion_id))
                await db.commit()
                
                # Notificar autor
                try:
                    author = await interaction.guild.fetch_member(int(user_id))
                    await author.send(
                        f"❌ A tua sugestão foi recusada.\n\n**Sugestão:** {suggestion}\n"
                        f"**Recusada por:** {interaction.user.mention}\n"
                        f"**Razão:** {razao}"
                    )
                except:
                    pass
                
                await interaction.response.send_message(
                    "✅ Sugestão recusada!",
                    ephemeral=True
                )
                
            except discord.NotFound:
                await interaction.response.send_message(
                    "❌ Mensagem da sugestão não encontrada!",
                    ephemeral=True
                )
    
    # ===== SISTEMA DE GIVEAWAYS =====
    
    @app_commands.command(
        name="giveaway",
        description="🎉 Criar um giveaway"
    )
    @app_commands.describe(
        duracao="Duração em minutos",
        vencedores="Número de vencedores",
        premio="Prêmio do giveaway",
        requisitos="Requisitos para participar (opcional)"
    )
    @app_commands.checks.has_permissions(manage_guild=True)
    async def giveaway(
        self, 
        interaction: discord.Interaction, 
        duracao: int, 
        vencedores: int, 
        premio: str,
        requisitos: str = None
    ):
        """Criar giveaway automatizado"""
        
        if duracao < 1:
            await interaction.response.send_message(
                "❌ A duração deve ser de pelo menos 1 minuto!",
                ephemeral=True
            )
            return
        
        if vencedores < 1:
            await interaction.response.send_message(
                "❌ Deve haver pelo menos 1 vencedor!",
                ephemeral=True
            )
            return
        
        # Calcular tempo de término
        ends_at = datetime.utcnow() + timedelta(minutes=duracao)
        
        # Criar embed
        embed = discord.Embed(
            title="🎉 GIVEAWAY 🎉",
            description=f"**Prêmio:** {premio}\n\n"
                       f"React com 🎉 para participar!\n"
                       f"**Vencedores:** {vencedores}\n"
                       f"**Termina:** <t:{int(ends_at.timestamp())}:R>",
            color=discord.Color.gold(),
            timestamp=ends_at
        )
        
        if requisitos:
            embed.add_field(name="📋 Requisitos", value=requisitos, inline=False)
        
        embed.set_footer(text=f"Hosted by {interaction.user.display_name}")
        
        # Enviar mensagem
        await interaction.response.send_message("✅ Giveaway criado!", ephemeral=True)
        msg = await interaction.channel.send(embed=embed)
        await msg.add_reaction("🎉")
        
        # Salvar na database
        import aiosqlite
        async with aiosqlite.connect(self.bot.db.db_path) as db:
            await db.execute("""
                INSERT INTO giveaways 
                (guild_id, channel_id, message_id, host_id, prize, winners_count, requirements, ends_at, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
            """, (
                str(interaction.guild.id), 
                str(interaction.channel.id), 
                str(msg.id),
                str(interaction.user.id),
                premio,
                vencedores,
                requisitos,
                ends_at.isoformat()
            ))
            await db.commit()
        
        bot_logger.info(f"Giveaway criado por {interaction.user} - Premio: {premio}")
        
        # Aguardar término
        await asyncio.sleep(duracao * 60)
        await self.end_giveaway(msg.id, interaction.guild.id)
    
    async def end_giveaway(self, message_id: int, guild_id: int):
        """Terminar giveaway e escolher vencedores"""
        
        import aiosqlite
        async with aiosqlite.connect(self.bot.db.db_path) as db:
            cursor = await db.execute("""
                SELECT channel_id, winners_count, prize, host_id
                FROM giveaways
                WHERE message_id = ? AND guild_id = ? AND status = 'active'
            """, (str(message_id), str(guild_id)))
            row = await cursor.fetchone()
            
            if not row:
                return
            
            channel_id, winners_count, prize, host_id = row
            
            guild = self.bot.get_guild(int(guild_id))
            channel = guild.get_channel(int(channel_id))
            
            try:
                msg = await channel.fetch_message(int(message_id))
                
                # Obter participantes
                reaction = discord.utils.get(msg.reactions, emoji="🎉")
                if not reaction:
                    await channel.send("❌ Nenhum participante no giveaway!")
                    return
                
                participants = []
                async for user in reaction.users():
                    if not user.bot:
                        participants.append(user)
                
                if len(participants) == 0:
                    await channel.send("❌ Nenhum participante válido no giveaway!")
                    return
                
                # Escolher vencedores
                winners = random.sample(participants, min(winners_count, len(participants)))
                
                # Anunciar vencedores
                winners_mention = ", ".join([winner.mention for winner in winners])
                
                embed = discord.Embed(
                    title="🎉 GIVEAWAY TERMINADO 🎉",
                    description=f"**Prêmio:** {prize}\n\n"
                               f"**{'Vencedor' if len(winners) == 1 else 'Vencedores'}:** {winners_mention}",
                    color=discord.Color.green(),
                    timestamp=datetime.utcnow()
                )
                
                await msg.edit(embed=embed)
                await channel.send(
                    f"🎊 Parabéns {winners_mention}! Ganhaste **{prize}**!\n"
                    f"Contacta <@{host_id}> para reclamar o prémio."
                )
                
                # Atualizar database
                await db.execute("""
                    UPDATE giveaways 
                    SET status = 'ended', ended_at = CURRENT_TIMESTAMP
                    WHERE message_id = ?
                """, (str(message_id),))
                await db.commit()
                
                bot_logger.info(f"Giveaway terminado - Vencedores: {[w.name for w in winners]}")
                
            except discord.NotFound:
                bot_logger.error(f"Mensagem de giveaway não encontrada: {message_id}")
    
    # ===== COMANDOS DE TIMESTAMP =====
    
    @app_commands.command(
        name="timestamp",
        description="🕒 Gerar timestamp do Discord"
    )
    @app_commands.describe(
        data_hora="Data e hora (formato: DD/MM/YYYY HH:MM)",
        estilo="Estilo de exibição do timestamp"
    )
    @app_commands.choices(estilo=[
        app_commands.Choice(name="Data e Hora Curta (16:20)", value="t"),
        app_commands.Choice(name="Data e Hora Longa (16:20:30)", value="T"),
        app_commands.Choice(name="Data Curta (20/04/2021)", value="d"),
        app_commands.Choice(name="Data Longa (20 Abril 2021)", value="D"),
        app_commands.Choice(name="Relativo (há 2 meses)", value="R"),
        app_commands.Choice(name="Data e Hora Completa (Terça, 20 Abril 2021 16:20)", value="F"),
        app_commands.Choice(name="Dia da Semana, Data (Terça, 20 Abril 2021)", value="f"),
    ])
    async def timestamp(self, interaction: discord.Interaction, data_hora: str, estilo: str = "F"):
        """Gerar timestamp formatado"""
        
        try:
            # Parse da data
            dt = datetime.strptime(data_hora, "%d/%m/%Y %H:%M")
            timestamp = int(dt.timestamp())
            
            # Gerar código
            code = f"<t:{timestamp}:{estilo}>"
            
            embed = discord.Embed(
                title="🕒 Timestamp Gerado",
                description=f"**Código:**\n```{code}```\n\n**Preview:** {code}",
                color=discord.Color.blue()
            )
            embed.add_field(
                name="📋 Copiar",
                value=f"Copia o código acima e cola na tua mensagem!",
                inline=False
            )
            
            await interaction.response.send_message(embed=embed, ephemeral=True)
            
        except ValueError:
            await interaction.response.send_message(
                "❌ Formato inválido! Use: DD/MM/YYYY HH:MM\n"
                "Exemplo: 25/12/2024 18:30",
                ephemeral=True
            )
    
    # ===== SISTEMA DE NOTAS PESSOAIS (GRUPO) =====
    
    @nota_group.command(
        name="add",
        description="📝 Adicionar nota pessoal privada"
    )
    @app_commands.describe(
        titulo="Título da nota",
        conteudo="Conteúdo da nota",
        tags="Tags separadas por vírgula (opcional)"
    )
    async def note_add(self, interaction: discord.Interaction, titulo: str, conteudo: str, tags: str = None):
        """Adicionar nota pessoal"""
        
        import aiosqlite
        async with aiosqlite.connect(self.bot.db.db_path) as db:
            await db.execute("""
                INSERT INTO personal_notes (user_id, guild_id, title, content, tags)
                VALUES (?, ?, ?, ?, ?)
            """, (
                str(interaction.user.id),
                str(interaction.guild.id),
                titulo,
                conteudo,
                tags
            ))
            await db.commit()
        
        embed = discord.Embed(
            title="✅ Nota Criada",
            description=f"**Título:** {titulo}\n**Conteúdo:** {conteudo[:100]}{'...' if len(conteudo) > 100 else ''}",
            color=discord.Color.green()
        )
        if tags:
            embed.add_field(name="🏷️ Tags", value=tags, inline=False)
        
        await interaction.response.send_message(embed=embed, ephemeral=True)
        bot_logger.info(f"Nota criada por {interaction.user}: {titulo}")
    
    @nota_group.command(
        name="list",
        description="📋 Ver as tuas notas pessoais"
    )
    @app_commands.describe(
        tag="Filtrar por tag (opcional)"
    )
    async def note_list(self, interaction: discord.Interaction, tag: str = None):
        """Listar notas pessoais"""
        
        import aiosqlite
        async with aiosqlite.connect(self.bot.db.db_path) as db:
            if tag:
                cursor = await db.execute("""
                    SELECT id, title, content, tags, created_at, pinned
                    FROM personal_notes
                    WHERE user_id = ? AND guild_id = ? AND tags LIKE ?
                    ORDER BY pinned DESC, created_at DESC
                """, (str(interaction.user.id), str(interaction.guild.id), f"%{tag}%"))
            else:
                cursor = await db.execute("""
                    SELECT id, title, content, tags, created_at, pinned
                    FROM personal_notes
                    WHERE user_id = ? AND guild_id = ?
                    ORDER BY pinned DESC, created_at DESC
                """, (str(interaction.user.id), str(interaction.guild.id)))
            
            notes = await cursor.fetchall()
        
        if not notes:
            await interaction.response.send_message(
                "📝 Não tens notas guardadas!" + (f" com a tag **{tag}**" if tag else ""),
                ephemeral=True
            )
            return
        
        embed = discord.Embed(
            title=f"📋 As Tuas Notas" + (f" (Tag: {tag})" if tag else ""),
            color=discord.Color.blue()
        )
        
        for note_id, title, content, tags, created_at, pinned in notes[:10]:
            pin_emoji = "📌 " if pinned else ""
            embed.add_field(
                name=f"{pin_emoji}{title} (ID: {note_id})",
                value=f"{content[:50]}{'...' if len(content) > 50 else ''}\n"
                      f"{'🏷️ ' + tags if tags else ''}\n"
                      f"📅 {created_at}",
                inline=False
            )
        
        if len(notes) > 10:
            embed.set_footer(text=f"A mostrar 10 de {len(notes)} notas. Use /note_view para ver mais.")
        
        await interaction.response.send_message(embed=embed, ephemeral=True)
    
    @nota_group.command(
        name="view",
        description="👁️ Ver nota completa"
    )
    @app_commands.describe(
        note_id="ID da nota"
    )
    async def note_view(self, interaction: discord.Interaction, note_id: int):
        """Ver nota completa"""
        
        import aiosqlite
        async with aiosqlite.connect(self.bot.db.db_path) as db:
            cursor = await db.execute("""
                SELECT title, content, tags, created_at, updated_at
                FROM personal_notes
                WHERE id = ? AND user_id = ?
            """, (note_id, str(interaction.user.id)))
            row = await cursor.fetchone()
        
        if not row:
            await interaction.response.send_message(
                "❌ Nota não encontrada!",
                ephemeral=True
            )
            return
        
        title, content, tags, created_at, updated_at = row
        
        embed = discord.Embed(
            title=f"📝 {title}",
            description=content,
            color=discord.Color.blue()
        )
        if tags:
            embed.add_field(name="🏷️ Tags", value=tags, inline=False)
        embed.add_field(name="📅 Criada", value=created_at, inline=True)
        if updated_at != created_at:
            embed.add_field(name="🔄 Atualizada", value=updated_at, inline=True)
        embed.set_footer(text=f"ID: {note_id}")
        
        await interaction.response.send_message(embed=embed, ephemeral=True)
    
    @nota_group.command(
        name="delete",
        description="🗑️ Apagar nota"
    )
    @app_commands.describe(
        note_id="ID da nota a apagar"
    )
    async def note_delete(self, interaction: discord.Interaction, note_id: int):
        """Apagar nota"""
        
        import aiosqlite
        async with aiosqlite.connect(self.bot.db.db_path) as db:
            cursor = await db.execute("""
                DELETE FROM personal_notes
                WHERE id = ? AND user_id = ?
            """, (note_id, str(interaction.user.id)))
            await db.commit()
            
            if cursor.rowcount == 0:
                await interaction.response.send_message(
                    "❌ Nota não encontrada!",
                    ephemeral=True
                )
                return
        
        await interaction.response.send_message(
            f"✅ Nota #{note_id} apagada com sucesso!",
            ephemeral=True
        )
    
    # ===== SISTEMA AFK =====
    
    @app_commands.command(
        name="afk",
        description="💤 Definir status AFK"
    )
    @app_commands.describe(
        razao="Razão do AFK (opcional)"
    )
    async def afk(self, interaction: discord.Interaction, razao: str = "AFK"):
        """Definir status AFK"""
        
        import aiosqlite
        async with aiosqlite.connect(self.bot.db.db_path) as db:
            await db.execute("""
                INSERT OR REPLACE INTO afk_status (user_id, guild_id, reason, set_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            """, (str(interaction.user.id), str(interaction.guild.id), razao))
            await db.commit()
        
        await interaction.response.send_message(
            f"💤 Definiste o teu status como AFK: **{razao}**\n"
            f"Quando enviares uma mensagem, o AFK será removido automaticamente.",
            ephemeral=True
        )
        bot_logger.info(f"{interaction.user} definiu AFK: {razao}")
    
    # ===== VOICE TRACKER (GRUPO) =====
    
    @voz_group.command(
        name="stats",
        description="🎤 Ver estatísticas de tempo em voz"
    )
    @app_commands.describe(
        membro="Membro a ver estatísticas (opcional)"
    )
    async def voicestats(self, interaction: discord.Interaction, membro: discord.Member = None):
        """Ver estatísticas de voz"""
        
        target = membro or interaction.user
        
        import aiosqlite
        async with aiosqlite.connect(self.bot.db.db_path) as db:
            cursor = await db.execute("""
                SELECT total_time, sessions_count, last_session
                FROM voice_totals
                WHERE user_id = ? AND guild_id = ?
            """, (str(target.id), str(interaction.guild.id)))
            row = await cursor.fetchone()
            
            if not row:
                await interaction.response.send_message(
                    f"📊 {target.mention} ainda não tem tempo registado em canais de voz!",
                    ephemeral=True
                )
                return
            
            total_time, sessions_count, last_session = row
            
            # Formatar tempo
            hours = total_time // 3600
            minutes = (total_time % 3600) // 60
            
            # Calcular média por sessão
            avg_time = total_time // sessions_count if sessions_count > 0 else 0
            avg_minutes = avg_time // 60
            
            embed = discord.Embed(
                title=f"🎤 Estatísticas de Voz - {target.display_name}",
                color=discord.Color.blue(),
                timestamp=datetime.utcnow()
            )
            embed.set_thumbnail(url=target.display_avatar.url)
            
            embed.add_field(
                name="⏱️ Tempo Total",
                value=f"**{hours}h {minutes}m**",
                inline=True
            )
            embed.add_field(
                name="🔢 Sessões",
                value=f"**{sessions_count}**",
                inline=True
            )
            embed.add_field(
                name="📊 Média/Sessão",
                value=f"**{avg_minutes}m**",
                inline=True
            )
            
            if last_session:
                embed.add_field(
                    name="🕒 Última Sessão",
                    value=f"<t:{int(datetime.fromisoformat(last_session).timestamp())}:R>",
                    inline=False
                )
            
            await interaction.response.send_message(embed=embed)
    
    @voz_group.command(
        name="leaderboard",
        description="🏆 Top utilizadores em tempo de voz"
    )
    async def voice_leaderboard(self, interaction: discord.Interaction):
        """Leaderboard de voz"""
        
        import aiosqlite
        async with aiosqlite.connect(self.bot.db.db_path) as db:
            cursor = await db.execute("""
                SELECT user_id, total_time, sessions_count
                FROM voice_totals
                WHERE guild_id = ?
                ORDER BY total_time DESC
                LIMIT 10
            """, (str(interaction.guild.id),))
            rows = await cursor.fetchall()
        
        if not rows:
            await interaction.response.send_message(
                "📊 Ainda não há dados de voz registados!",
                ephemeral=True
            )
            return
        
        embed = discord.Embed(
            title="🏆 Top 10 - Tempo em Voz",
            color=discord.Color.gold(),
            timestamp=datetime.utcnow()
        )
        
        medals = ["🥇", "🥈", "🥉"]
        
        for i, (user_id, total_time, sessions_count) in enumerate(rows, 1):
            user = interaction.guild.get_member(int(user_id))
            if not user:
                continue
            
            hours = total_time // 3600
            minutes = (total_time % 3600) // 60
            
            medal = medals[i-1] if i <= 3 else f"`#{i}`"
            
            embed.add_field(
                name=f"{medal} {user.display_name}",
                value=f"⏱️ **{hours}h {minutes}m** | 🔢 {sessions_count} sessões",
                inline=False
            )
        
        await interaction.response.send_message(embed=embed)
    
    # ===== STARBOARD SETUP =====
    
    @app_commands.command(
        name="setup_starboard",
        description="⭐ Configurar sistema de Starboard"
    )
    @app_commands.describe(
        canal="Canal para o starboard",
        threshold="Número mínimo de reações (padrão: 3)",
        emoji="Emoji para usar (padrão: ⭐)",
        self_star="Permitir reagir às próprias mensagens (padrão: Não)"
    )
    @app_commands.checks.has_permissions(manage_guild=True)
    async def setup_starboard(
        self,
        interaction: discord.Interaction,
        canal: discord.TextChannel,
        threshold: int = 3,
        emoji: str = "⭐",
        self_star: bool = False
    ):
        """Configurar Starboard"""
        
        if threshold < 1:
            await interaction.response.send_message(
                "❌ O threshold deve ser pelo menos 1!",
                ephemeral=True
            )
            return
        
        # Atualizar configuração
        if 'starboard' not in self.config:
            self.config['starboard'] = {}
        
        self.config['starboard']['channel_id'] = canal.id
        self.config['starboard']['star_threshold'] = threshold
        self.config['starboard']['emoji'] = emoji
        self.config['starboard']['enabled'] = True
        self.config['starboard']['self_star'] = self_star
        
        # Salvar configuração
        with open(self.config_file, 'w', encoding='utf-8') as f:
            json.dump(self.config, f, indent=2, ensure_ascii=False)
        
        # Atualizar database config
        import aiosqlite
        async with aiosqlite.connect(self.bot.db.db_path) as db:
            await db.execute("""
                INSERT OR REPLACE INTO starboard_config 
                (guild_id, channel_id, star_threshold, emoji, enabled, self_star)
                VALUES (?, ?, ?, ?, 1, ?)
            """, (
                str(interaction.guild.id),
                str(canal.id),
                threshold,
                emoji,
                1 if self_star else 0
            ))
            await db.commit()
        
        embed = discord.Embed(
            title="⭐ Starboard Configurado",
            description=f"O sistema de Starboard foi configurado com sucesso!",
            color=discord.Color.gold()
        )
        embed.add_field(name="📢 Canal", value=canal.mention, inline=True)
        embed.add_field(name="🔢 Threshold", value=str(threshold), inline=True)
        embed.add_field(name="⭐ Emoji", value=emoji, inline=True)
        embed.add_field(name="🔄 Self-Star", value="✅ Sim" if self_star else "❌ Não", inline=True)
        
        await interaction.response.send_message(embed=embed)
        bot_logger.info(f"Starboard configurado por {interaction.user} em {interaction.guild}")
    
    # ===== SUGGESTIONS SETUP =====
    
    @app_commands.command(
        name="setup_suggestions",
        description="💡 Configurar sistema de sugestões"
    )
    @app_commands.describe(
        canal="Canal para sugestões"
    )
    @app_commands.checks.has_permissions(manage_guild=True)
    async def setup_suggestions(self, interaction: discord.Interaction, canal: discord.TextChannel):
        """Configurar sistema de sugestões"""
        
        # Atualizar configuração
        if 'suggestions' not in self.config:
            self.config['suggestions'] = {}
        
        self.config['suggestions']['channel_id'] = canal.id
        
        # Salvar configuração
        with open(self.config_file, 'w', encoding='utf-8') as f:
            json.dump(self.config, f, indent=2, ensure_ascii=False)
        
        embed = discord.Embed(
            title="💡 Sistema de Sugestões Configurado",
            description=f"As sugestões serão enviadas para {canal.mention}",
            color=discord.Color.green()
        )
        embed.add_field(
            name="📝 Como usar",
            value="Os membros podem usar `/suggest` para criar sugestões!\n"
                  "Use `/approve_suggestion` ou `/deny_suggestion` para gerir.",
            inline=False
        )
        
        await interaction.response.send_message(embed=embed)
        bot_logger.info(f"Sistema de sugestões configurado por {interaction.user} em {interaction.guild}")


async def setup(bot):
    await bot.add_cog(UtilitiesAdvanced(bot))
