import random
import io
import discord
from discord.ext import commands
from PIL import Image, ImageFont, ImageDraw, ImageFilter
import aiohttp


class ShipVoteView(discord.ui.View):
    """View com botões para votar no ship"""
    
    def __init__(self, user1: discord.Member, user2: discord.Member, percentagem: int):
        super().__init__(timeout=300)  # 5 minutos
        self.user1 = user1
        self.user2 = user2
        self.percentagem = percentagem
        self.approves = set()
        self.rejects = set()
    
    @discord.ui.button(label="❤️ Aprovo", style=discord.ButtonStyle.success, custom_id="approve_ship")
    async def approve_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        """Botão para aprovar o ship"""
        user_id = interaction.user.id
        
        if user_id in self.rejects:
            self.rejects.remove(user_id)
        
        if user_id in self.approves:
            self.approves.remove(user_id)
            await interaction.response.send_message("💔 Removeste o teu voto de aprovação!", ephemeral=True)
        else:
            self.approves.add(user_id)
            await interaction.response.send_message("❤️ Votaste a favor deste ship!", ephemeral=True)
        
        # Atualizar contadores
        button.label = f"❤️ Aprovo ({len(self.approves)})"
        reject_button = [b for b in self.children if b.custom_id == "reject_ship"][0]
        reject_button.label = f"💔 Recuso ({len(self.rejects)})"
        
        await interaction.message.edit(view=self)
    
    @discord.ui.button(label="💔 Recuso", style=discord.ButtonStyle.danger, custom_id="reject_ship")
    async def reject_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        """Botão para recusar o ship"""
        user_id = interaction.user.id
        
        if user_id in self.approves:
            self.approves.remove(user_id)
        
        if user_id in self.rejects:
            self.rejects.remove(user_id)
            await interaction.response.send_message("❤️ Removeste o teu voto de rejeição!", ephemeral=True)
        else:
            self.rejects.add(user_id)
            await interaction.response.send_message("💔 Votaste contra este ship!", ephemeral=True)
        
        # Atualizar contadores
        button.label = f"💔 Recuso ({len(self.rejects)})"
        approve_button = [b for b in self.children if b.custom_id == "approve_ship"][0]
        approve_button.label = f"❤️ Aprovo ({len(self.approves)})"
        
        await interaction.message.edit(view=self)
    
    @discord.ui.button(label="📊 Ver Votos", style=discord.ButtonStyle.secondary, custom_id="view_votes")
    async def view_votes_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        """Botão para ver estatísticas dos votos"""
        total = len(self.approves) + len(self.rejects)
        
        if total == 0:
            await interaction.response.send_message("📊 Ainda não há votos!", ephemeral=True)
            return
        
        approve_percent = int((len(self.approves) / total) * 100) if total > 0 else 0
        reject_percent = int((len(self.rejects) / total) * 100) if total > 0 else 0
        
        embed = discord.Embed(
            title="📊 Estatísticas de Votação",
            description=f"**{self.user1.display_name}** x **{self.user2.display_name}**",
            color=discord.Color.blurple()
        )
        embed.add_field(name="❤️ Aprovam", value=f"{len(self.approves)} votos ({approve_percent}%)", inline=True)
        embed.add_field(name="💔 Recusam", value=f"{len(self.rejects)} votos ({reject_percent}%)", inline=True)
        embed.add_field(name="📈 Total", value=f"{total} votos", inline=True)
        embed.add_field(name="🎯 Compatibilidade Original", value=f"{self.percentagem}%", inline=False)
        
        await interaction.response.send_message(embed=embed, ephemeral=True)


class FunCog(commands.Cog):
    """Cog para comandos divertidos"""
    
    def __init__(self, bot):
        self.bot = bot

    @discord.app_commands.command(name="teste", description="Testa se o bot está a funcionar")
    async def teste(self, interaction: discord.Interaction):
        """Comando de teste"""
        embed = discord.Embed(
            title="✅ Bot A Funcionar!",
            description="O EPA Bot está online e operacional!",
            color=discord.Color.green()
        )
        embed.add_field(name="Ping", value=f"{round(self.bot.latency * 1000)}ms", inline=True)
        embed.set_footer(text=f"Pedido por {interaction.user.name}")
        
        await interaction.response.send_message(embed=embed)

    @discord.app_commands.command(name="ship", description="Calcula a compatibilidade entre dois utilizadores")
    @discord.app_commands.describe(
        utilizador1="Primeiro utilizador",
        utilizador2="Segundo utilizador (opcional, se não especificado serás tu)"
    )
    async def ship(self, interaction: discord.Interaction, utilizador1: discord.Member, utilizador2: discord.Member = None):
        """
        Calcula a compatibilidade entre dois utilizadores
        
        Args:
            interaction: Interacção do Discord
            utilizador1: Primeiro utilizador
            utilizador2: Segundo utilizador (padrão: utilizador que executou o comando)
        """
        # Defer imediatamente para evitar timeout
        await interaction.response.defer()
        
        if utilizador2 is None:
            utilizador2 = interaction.user
        
        if utilizador1 == utilizador2:
            await interaction.followup.send("❌ Não podes fazer ship contigo próprio!", ephemeral=True)
            return
        
        # Gerar percentagem completamente aleatória (diferente a cada vez)
        percentagem = random.randint(0, 100)
        
        # Gerar atributos de compatibilidade
        quimica = random.randint(0, 100)
        atracao = random.randint(0, 100)
        futuro = random.randint(0, 100)
        confianca = random.randint(0, 100)
        
        # Determinar emoji, mensagem, badge e easter eggs
        if percentagem == 100:
            emoji = "💯"
            mensagem = "**PERFECT MATCH!** Casamento JÁ! 💒"
            badge = "💍 Marriage Material"
            previsao = "Em 2026: Vão ter 3 gatos e um cão juntos 🐱🐱🐱🐶"
        elif percentagem == 69:
            emoji = "😏"
            mensagem = "Nice. 😏💦"
            badge = "🔥 Spicy Match"
            previsao = "Em 2026: Muitas aventuras... picantes 🌶️"
        elif percentagem >= 90:
            emoji = "💖"
            mensagem = "Amor verdadeiro! Quando é o casamento?"
            badge = "👑 Couple Goals"
            previsao = "Em 2026: Vão viajar pelo mundo juntos ✈️"
        elif percentagem >= 80:
            emoji = "💕"
            mensagem = "Muito compatíveis! Há futuro aqui!"
            badge = "💘 Love Birds"
            previsao = "Em 2026: Primeiras férias a dois 🏖️"
        elif percentagem >= 70:
            emoji = "💗"
            mensagem = "Boa química! E que tal marcar um date?"
            badge = "✨ Great Match"
            previsao = "Em 2026: Primeiro jantar romântico 🍝"
        elif percentagem >= 50:
            emoji = "💛"
            mensagem = "Há potencial... Com esforço pode funcionar!"
            badge = "🤝 Potential Couple"
            previsao = "Em 2026: Talvez sejam amigos próximos 👥"
        elif percentagem >= 30:
            emoji = "💙"
            mensagem = "Melhor ficarem como amigos..."
            badge = "👋 Friend Zone"
            previsao = "Em 2026: Vão rir desta ship 😅"
        elif percentagem == 0:
            emoji = "☠️"
            mensagem = "**EVITEM-SE A TODO O CUSTO!** 🚨"
            badge = "⚠️ Danger Zone"
            previsao = "Em 2026: Em continentes diferentes... espero 🌍"
        else:
            emoji = "💔"
            mensagem = "Incompatíveis... Aceitem e sigam em frente."
            badge = "😬 Awkward Match"
            previsao = "Em 2026: Nem se vão lembrar disto 🤷"
        
        # Criar barra de progresso visual
        filled = int(percentagem / 10)
        empty = 10 - filled
        progress_bar = f"[{'█' * filled}{'░' * empty}] {percentagem}%"
        
        # Criar nome do ship
        nome1 = utilizador1.display_name[:len(utilizador1.display_name)//2]
        nome2 = utilizador2.display_name[len(utilizador2.display_name)//2:]
        ship_name = nome1 + nome2
        
        # Gerar dica de encontro aleatória
        dicas = [
            "💡 Levem-na para jantar à luz das velas 🕯️",
            "💡 Um piquenique ao pôr do sol pode ajudar 🌅",
            "💡 Cinema + pipocas = sucesso garantido 🍿",
            "💡 Karaoke a dois revela a verdadeira personalidade 🎤",
            "💡 Escapadinha de fim de semana? 🏔️",
            "💡 Cozinhar juntos cria laços 👨‍🍳👩‍🍳",
            "💡 Escape room testa o trabalho em equipa 🔐",
            "💡 Passear de mãos dadas no parque 🌳",
            "💡 Assistir ao nascer do sol juntos ☀️",
            "💡 Netflix and chill? 📺😏"
        ]
        dica = random.choice(dicas)
        
        try:
            # Tentar criar imagem
            ship_image = await self._create_ship_image(utilizador1, utilizador2, percentagem)
            
            embed = discord.Embed(
                title=f"{emoji} Ship: {ship_name}",
                description=f"**{utilizador1.display_name}** x **{utilizador2.display_name}**\n{badge}",
                color=discord.Color.from_rgb(255, 105, 180)  # Hot pink
            )
            
            # Barra de progresso
            embed.add_field(name="💖 Compatibilidade", value=f"```{progress_bar}```", inline=False)
            
            # Atributos detalhados
            atributos = (
                f"🧪 **Química:** {quimica}%\n"
                f"✨ **Atração:** {atracao}%\n"
                f"🔮 **Futuro:** {futuro}%\n"
                f"🤝 **Confiança:** {confianca}%"
            )
            embed.add_field(name="📊 Análise Detalhada", value=atributos, inline=True)
            
            # Mensagem e previsão
            embed.add_field(name="💬 Veredito", value=mensagem, inline=False)
            embed.add_field(name="🔮 Previsão", value=previsao, inline=False)
            embed.add_field(name="💝 Dica de Encontro", value=dica, inline=False)
            
            embed.set_footer(text=f"✨ Pedido por {interaction.user.name} • Ship #{random.randint(1000, 9999)}")
            
            if ship_image:
                file = discord.File(ship_image, filename="ship.png")
                embed.set_image(url="attachment://ship.png")
                
                # Criar view com botões de reação
                view = ShipVoteView(utilizador1, utilizador2, percentagem)
                await interaction.followup.send(embed=embed, file=file, view=view)
            else:
                view = ShipVoteView(utilizador1, utilizador2, percentagem)
                await interaction.followup.send(embed=embed, view=view)
                
        except Exception as e:
            # Fallback sem imagem
            embed = discord.Embed(
                title=f"{emoji} Ship: {ship_name}",
                description=f"**{utilizador1.display_name}** x **{utilizador2.display_name}**\n{badge}",
                color=discord.Color.from_rgb(255, 105, 180)
            )
            
            embed.add_field(name="💖 Compatibilidade", value=f"```{progress_bar}```", inline=False)
            
            atributos = (
                f"🧪 **Química:** {quimica}%\n"
                f"✨ **Atração:** {atracao}%\n"
                f"🔮 **Futuro:** {futuro}%\n"
                f"🤝 **Confiança:** {confianca}%"
            )
            embed.add_field(name="📊 Análise Detalhada", value=atributos, inline=True)
            embed.add_field(name="💬 Veredito", value=mensagem, inline=False)
            embed.add_field(name="🔮 Previsão", value=previsao, inline=False)
            embed.add_field(name="💝 Dica de Encontro", value=dica, inline=False)
            
            embed.set_footer(text=f"✨ Pedido por {interaction.user.name} • Ship #{random.randint(1000, 9999)}")
            
            view = ShipVoteView(utilizador1, utilizador2, percentagem)
            await interaction.followup.send(embed=embed, view=view)

    @discord.app_commands.command(name="shipadm", description="[ADMIN] Faz ship com porcentagem personalizada (trolagem)")
    @discord.app_commands.describe(
        utilizador1="Primeiro utilizador",
        utilizador2="Segundo utilizador",
        percentagem="Porcentagem de compatibilidade (0-100)"
    )
    @discord.app_commands.default_permissions(administrator=True)
    async def shipadm(self, interaction: discord.Interaction, utilizador1: discord.Member, utilizador2: discord.Member, percentagem: int):
        """
        Faz ship com porcentagem personalizada (só para admins trollarem)
        
        Args:
            interaction: Interacção do Discord
            utilizador1: Primeiro utilizador
            utilizador2: Segundo utilizador
            percentagem: Porcentagem escolhida (0-100)
        """
        # Verificar se é admin
        if not interaction.user.guild_permissions.administrator:
            await interaction.response.send_message("❌ Apenas administradores podem usar este comando!", ephemeral=True)
            return
        
        # Defer imediatamente para evitar timeout
        await interaction.response.defer()
        
        if utilizador1 == utilizador2:
            await interaction.followup.send("❌ Não podes fazer ship da mesma pessoa!", ephemeral=True)
            return
        
        # Validar porcentagem
        if percentagem < 0 or percentagem > 100:
            await interaction.followup.send("❌ A porcentagem deve estar entre 0 e 100!", ephemeral=True)
            return
        
        # Determinar emoji e mensagem baseada na percentagem
        if percentagem >= 90:
            emoji = "💖"
            mensagem = "Amor verdadeiro! Quando é a foda?"
        elif percentagem >= 70:
            emoji = "💕"
            mensagem = "Muito compatíveis! E que tal marcar um date?"
        elif percentagem >= 50:
            emoji = "💘"
            mensagem = "Boa química! Há potencial aqui!"
        elif percentagem >= 30:
            emoji = "💛"
            mensagem = "Talvez possam ser amigos..."
        else:
            emoji = "💔"
            mensagem = "Mais vale serem apenas conhecidos..."
        
        # Criar nome do ship
        nome1 = utilizador1.display_name[:len(utilizador1.display_name)//2]
        nome2 = utilizador2.display_name[len(utilizador2.display_name)//2:]
        ship_name = nome1 + nome2
        
        try:
            # Tentar criar imagem
            ship_image = await self._create_ship_image(utilizador1, utilizador2, percentagem)
            
            embed = discord.Embed(
                title=f"{emoji} Ship: {ship_name}",
                description=f"**{utilizador1.display_name}** x **{utilizador2.display_name}**",
                color=discord.Color.pink()
            )
            embed.add_field(name="Compatibilidade", value=f"{percentagem}%", inline=True)
            embed.add_field(name="Estado", value=mensagem, inline=True)
            embed.set_footer(text=f"🎭 Pedido por {interaction.user.name}")
            
            if ship_image:
                file = discord.File(ship_image, filename="ship.png")
                embed.set_image(url="attachment://ship.png")
                await interaction.followup.send(embed=embed, file=file)
            else:
                await interaction.followup.send(embed=embed)
                
        except Exception as e:
            # Fallback sem imagem
            embed = discord.Embed(
                title=f"{emoji} Ship: {ship_name}",
                description=f"**{utilizador1.display_name}** x **{utilizador2.display_name}**",
                color=discord.Color.pink()
            )
            embed.add_field(name="Compatibilidade", value=f"{percentagem}%", inline=True)
            embed.add_field(name="Estado", value=mensagem, inline=True)
            embed.set_footer(text=f"🎭 Pedido por {interaction.user.name}")
            
            await interaction.followup.send(embed=embed)

    async def _create_ship_image(self, user1: discord.Member, user2: discord.Member, percentagem: int) -> io.BytesIO:
        """Cria uma imagem melhorada para o ship com efeitos visuais"""
        try:
            # Baixar avatares
            avatar1_bytes = await user1.display_avatar.read()
            avatar2_bytes = await user2.display_avatar.read()
            
            # Abrir imagens
            avatar1 = Image.open(io.BytesIO(avatar1_bytes)).convert("RGBA")
            avatar2 = Image.open(io.BytesIO(avatar2_bytes)).convert("RGBA")
            
            # Redimensionar avatares
            size = 150
            avatar1 = avatar1.resize((size, size), Image.Resampling.LANCZOS)
            avatar2 = avatar2.resize((size, size), Image.Resampling.LANCZOS)
            
            # Criar máscara circular para avatares
            mask = Image.new('L', (size, size), 0)
            mask_draw = ImageDraw.Draw(mask)
            mask_draw.ellipse((0, 0, size, size), fill=255)
            
            # Aplicar máscara circular
            avatar1_circle = Image.new("RGBA", (size, size), (0, 0, 0, 0))
            avatar1_circle.paste(avatar1, (0, 0))
            avatar1_circle.putalpha(mask)
            
            avatar2_circle = Image.new("RGBA", (size, size), (0, 0, 0, 0))
            avatar2_circle.paste(avatar2, (0, 0))
            avatar2_circle.putalpha(mask)
            
            # Criar imagem base com gradiente
            width = 500
            height = 250
            img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
            
            # Criar fundo gradiente baseado na percentagem
            for y in range(height):
                # Gradiente de rosa para vermelho baseado na percentagem
                if percentagem >= 70:
                    r = int(255 - (y / height) * 50)
                    g = int(20 + (y / height) * 50)
                    b = int(147 - (y / height) * 50)
                elif percentagem >= 40:
                    r = int(200 - (y / height) * 40)
                    g = int(50 + (y / height) * 30)
                    b = int(150 - (y / height) * 40)
                else:
                    r = int(100 - (y / height) * 20)
                    g = int(100 - (y / height) * 20)
                    b = int(120 - (y / height) * 20)
                
                draw = ImageDraw.Draw(img)
                draw.line([(0, y), (width, y)], fill=(r, g, b, 255))
            
            # Adicionar brilho/blur para efeito suave
            img = img.filter(ImageFilter.GaussianBlur(radius=2))
            
            # Colar avatares com borda
            border_size = 5
            avatar1_x = 40
            avatar1_y = 50
            avatar2_x = 310
            avatar2_y = 50
            
            # Desenhar borda branca nos avatares
            draw = ImageDraw.Draw(img)
            draw.ellipse(
                [(avatar1_x - border_size, avatar1_y - border_size),
                 (avatar1_x + size + border_size, avatar1_y + size + border_size)],
                fill=(255, 255, 255, 255)
            )
            draw.ellipse(
                [(avatar2_x - border_size, avatar2_y - border_size),
                 (avatar2_x + size + border_size, avatar2_y + size + border_size)],
                fill=(255, 255, 255, 255)
            )
            
            img.paste(avatar1_circle, (avatar1_x, avatar1_y), avatar1_circle)
            img.paste(avatar2_circle, (avatar2_x, avatar2_y), avatar2_circle)
            
            # Adicionar coração no meio com tamanho variável baseado na %
            try:
                # Tentar usar fonte personalizada
                if percentagem >= 80:
                    font_size = 60
                elif percentagem >= 50:
                    font_size = 50
                else:
                    font_size = 40
                
                font = ImageFont.truetype("seguiemj.ttf", font_size)
            except:
                try:
                    font = ImageFont.truetype("arial.ttf", 40)
                except:
                    font = ImageFont.load_default()
            
            draw = ImageDraw.Draw(img)
            
            # Desenhar múltiplos corações para efeito de brilho
            heart_emoji = "💖" if percentagem >= 70 else "💔" if percentagem < 30 else "💗"
            heart_x = width // 2 - 25
            heart_y = height // 2 - 30
            
            # Sombra do coração
            draw.text((heart_x + 2, heart_y + 2), heart_emoji, font=font, fill=(0, 0, 0, 100))
            # Coração principal
            draw.text((heart_x, heart_y), heart_emoji, font=font, fill=(255, 255, 255, 255))
            
            # Adicionar percentagem com fundo
            try:
                percent_font = ImageFont.truetype("arial.ttf", 32)
            except:
                percent_font = ImageFont.load_default()
            
            percent_text = f"{percentagem}%"
            
            # Calcular posição centralizada
            bbox = draw.textbbox((0, 0), percent_text, font=percent_font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            text_x = (width - text_width) // 2
            text_y = height - 45
            
            # Fundo semi-transparente para o texto
            padding = 10
            draw.rectangle(
                [(text_x - padding, text_y - padding),
                 (text_x + text_width + padding, text_y + text_height + padding)],
                fill=(0, 0, 0, 180)
            )
            
            # Texto com sombra
            draw.text((text_x + 2, text_y + 2), percent_text, font=percent_font, fill=(0, 0, 0, 255))
            draw.text((text_x, text_y), percent_text, font=percent_font, fill=(255, 255, 255, 255))
            
            # Adicionar sparkles/estrelas para high compatibility
            if percentagem >= 80:
                sparkles = ["✨", "⭐", "💫"]
                positions = [(30, 20), (450, 25), (25, 220), (460, 215), (240, 15)]
                for i, pos in enumerate(positions):
                    sparkle = sparkles[i % len(sparkles)]
                    try:
                        sparkle_font = ImageFont.truetype("seguiemj.ttf", 20)
                        draw.text(pos, sparkle, font=sparkle_font, fill=(255, 255, 255, 200))
                    except:
                        pass
            
            # Salvar em buffer
            buffer = io.BytesIO()
            img.save(buffer, format="PNG")
            buffer.seek(0)
            
            return buffer
            
        except Exception as e:
            print(f"Erro ao criar imagem: {e}")
            return None


async def setup(bot):
    """Função de setup do cog"""
    await bot.add_cog(FunCog(bot))
