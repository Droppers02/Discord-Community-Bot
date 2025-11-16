import random
import io
import discord
from discord.ext import commands
from PIL import Image, ImageFont, ImageDraw


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

    @discord.app_commands.command(name="dado", description="Lança um dado")
    @discord.app_commands.describe(
        lados="Número de lados do dado (padrão: 6)",
        quantidade="Quantidade de dados para lançar (padrão: 1)"
    )
    async def dado(self, interaction: discord.Interaction, lados: int = 6, quantidade: int = 1):
        """
        Lança um ou vários dados
        
        Args:
            interaction: Interacção do Discord
            lados: Número de lados do dado (padrão: 6)
            quantidade: Quantidade de dados (padrão: 1)
        """
        if lados < 2:
            await interaction.response.send_message("❌ O dado deve ter pelo menos 2 lados!", ephemeral=True)
            return
        
        if quantidade < 1 or quantidade > 10:
            await interaction.response.send_message("❌ Podes lançar entre 1 e 10 dados!", ephemeral=True)
            return
        
        resultados = [random.randint(1, lados) for _ in range(quantidade)]
        total = sum(resultados)
        
        embed = discord.Embed(title="🎲 A lançar dados!", color=discord.Color.blue())
        
        if quantidade == 1:
            embed.add_field(name="Resultado", value=f"**{resultados[0]}**", inline=False)
        else:
            embed.add_field(name="Resultados", value=" + ".join(map(str, resultados)), inline=False)
            embed.add_field(name="Total", value=f"**{total}**", inline=False)
        
        embed.add_field(name="Configuração", value=f"{quantidade}d{lados}", inline=True)
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
            embed.set_footer(text=f"Pedido por {interaction.user.name}")
            
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
            embed.set_footer(text=f"Pedido por {interaction.user.name}")
            
            await interaction.followup.send(embed=embed)

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
            embed.set_footer(text=f"🎭 Ship personalizado por {interaction.user.name}")
            
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
            embed.set_footer(text=f"🎭 Ship personalizado por {interaction.user.name}")
            
            await interaction.followup.send(embed=embed)

    async def _create_ship_image(self, user1: discord.Member, user2: discord.Member, percentagem: int) -> io.BytesIO:
        """Cria uma imagem para o ship"""
        try:
            # Baixar avatares
            avatar1_bytes = await user1.display_avatar.read()
            avatar2_bytes = await user2.display_avatar.read()
            
            # Abrir imagens
            avatar1 = Image.open(io.BytesIO(avatar1_bytes)).convert("RGBA")
            avatar2 = Image.open(io.BytesIO(avatar2_bytes)).convert("RGBA")
            
            # Redimensionar avatares
            size = 128
            avatar1 = avatar1.resize((size, size), Image.Resampling.LANCZOS)
            avatar2 = avatar2.resize((size, size), Image.Resampling.LANCZOS)
            
            # Criar imagem base
            width = 400
            height = 200
            img = Image.new("RGBA", (width, height), (54, 57, 63, 255))
            
            # Colar avatares
            img.paste(avatar1, (50, 36), avatar1)
            img.paste(avatar2, (222, 36), avatar2)
            
            # Adicionar coração no meio
            heart_size = 40
            try:
                # Tentar usar fonte personalizada
                font = ImageFont.truetype("RobotoMono-Bold.ttf", 24)
            except:
                # Usar fonte padrão se não encontrar
                font = ImageFont.load_default()
            
            draw = ImageDraw.Draw(img)
            
            # Determinar cor do coração baseada na percentagem
            if percentagem >= 70:
                heart_color = (255, 0, 100, 255)  # Rosa forte
            elif percentagem >= 40:
                heart_color = (255, 100, 150, 255)  # Rosa médio
            else:
                heart_color = (150, 150, 150, 255)  # Cinza
            
            # Desenhar coração (emoji alternativo)
            heart_x = width // 2 - 15
            heart_y = height // 2 - 15
            draw.text((heart_x, heart_y), "💖", font=font, fill=heart_color)
            
            # Adicionar percentagem
            percent_text = f"{percentagem}%"
            text_width = draw.textlength(percent_text, font=font)
            text_x = (width - text_width) // 2
            text_y = height - 40
            draw.text((text_x, text_y), percent_text, font=font, fill=(255, 255, 255, 255))
            
            # Salvar em buffer
            buffer = io.BytesIO()
            img.save(buffer, format="PNG")
            buffer.seek(0)
            
            return buffer
            
        except Exception as e:
            # Em caso de erro, retornar None
            buffer = io.BytesIO()
            return buffer


async def setup(bot):
    """Função de setup do cog"""
    await bot.add_cog(FunCog(bot))
