import discord
from discord.ext import commands
from discord import app_commands
import random
import asyncio
import aiohttp
import json
from typing import Optional
from utils.database import get_database


class HangmanView(discord.ui.View):
    """View para o jogo da forca com botões de letras"""
    
    def __init__(self, word: str, hint: str, user_id: int, cog):
        super().__init__(timeout=300)
        self.word = word.upper()
        self.hint = hint
        self.user_id = user_id
        self.cog = cog
        self.guessed_letters = set()
        self.wrong_guesses = 0
        self.max_wrong = 6
        
        # Adicionar botões de letras (A-Z)
        alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        for i, letter in enumerate(alphabet):
            button = discord.ui.Button(
                label=letter,
                style=discord.ButtonStyle.primary,
                custom_id=f"hangman_{letter}",
                row=i // 5  # 5 botões por linha
            )
            button.callback = self.make_guess_callback(letter)
            self.add_item(button)
    
    def make_guess_callback(self, letter: str):
        """Cria callback para botão de letra"""
        async def callback(interaction: discord.Interaction):
            if interaction.user.id != self.user_id:
                await interaction.response.send_message(
                    "❌ Este não é o teu jogo!", ephemeral=True
                )
                return
            
            # Adicionar letra às adivinhadas
            self.guessed_letters.add(letter)
            
            # Verificar se acertou
            if letter not in self.word:
                self.wrong_guesses += 1
            
            # Desabilitar botão
            for item in self.children:
                if isinstance(item, discord.ui.Button) and item.label == letter:
                    item.disabled = True
                    item.style = discord.ButtonStyle.success if letter in self.word else discord.ButtonStyle.danger
                    break
            
            # Verificar vitória/derrota
            if all(l in self.guessed_letters for l in self.word):
                await self.end_game(interaction, won=True)
                return
            
            if self.wrong_guesses >= self.max_wrong:
                await self.end_game(interaction, won=False)
                return
            
            # Atualizar embed
            embed = self.create_embed()
            await interaction.response.edit_message(embed=embed, view=self)
        
        return callback
    
    def create_embed(self) -> discord.Embed:
        """Criar embed do jogo"""
        # Palavra com letras adivinhadas
        display_word = " ".join([l if l in self.guessed_letters else "_" for l in self.word])
        
        # Desenhos da forca
        hangman_stages = [
            "```\n  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========```",
            "```\n  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========```",
            "```\n  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========```",
            "```\n  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========```",
            "```\n  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========```",
            "```\n  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========```",
            "```\n  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n=========```"
        ]
        
        embed = discord.Embed(
            title="🎪 Jogo da Forca",
            color=discord.Color.blue()
        )
        
        embed.add_field(name="💡 Dica:", value=self.hint, inline=False)
        embed.add_field(name="📝 Palavra:", value=f"**{display_word}**", inline=False)
        embed.add_field(name="🎨 Forca:", value=hangman_stages[self.wrong_guesses], inline=False)
        embed.add_field(
            name="❌ Erros:", 
            value=f"{self.wrong_guesses}/{self.max_wrong}",
            inline=True
        )
        
        if self.guessed_letters:
            wrong_letters = [l for l in self.guessed_letters if l not in self.word]
            if wrong_letters:
                embed.add_field(
                    name="🚫 Letras Erradas:",
                    value=" ".join(sorted(wrong_letters)),
                    inline=True
                )
        
        embed.set_footer(text="Clica nas letras para adivinhar • Timeout: 5 minutos")
        
        return embed
    
    async def end_game(self, interaction: discord.Interaction, won: bool):
        """Terminar jogo"""
        for item in self.children:
            item.disabled = True
        
        if won:
            embed = discord.Embed(
                title="🎉 Vitória!",
                description=f"Parabéns! Adivinhaste a palavra: **{self.word}**",
                color=discord.Color.green()
            )
            
            # Recompensa
            reward = 100
            try:
                economy_cog = self.cog.bot.get_cog("SimpleEconomy")
                if economy_cog:
                    economy_cog.add_money(str(self.user_id), reward)
                    embed.add_field(name="💰 Recompensa", value=f"{reward} EPA Coins!", inline=False)
            except:
                pass
        else:
            embed = discord.Embed(
                title="💀 Derrota!",
                description=f"A palavra era: **{self.word}**\n\n💡 Dica: {self.hint}",
                color=discord.Color.red()
            )
        
        embed.add_field(
            name="📊 Estatísticas:",
            value=f"Erros: {self.wrong_guesses}/{self.max_wrong}\nLetras tentadas: {len(self.guessed_letters)}",
            inline=False
        )
        
        await interaction.response.edit_message(embed=embed, view=self)
        
        # Remover do active_games
        if self.user_id in self.cog.active_games:
            del self.cog.active_games[self.user_id]
    
    async def on_timeout(self):
        """Timeout do jogo"""
        if self.user_id in self.cog.active_games:
            del self.cog.active_games[self.user_id]


class GamesExtraCog(commands.Cog):
    """Cog para jogos adicionais e diversão"""
    
    def __init__(self, bot):
        self.bot = bot
        self.db = None
        self.active_games = {}  # Jogos ativos
        
        self.quiz_questions = [
            {
                "question": "Qual é a capital de Portugal?",
                "options": ["Lisboa", "Porto", "Coimbra", "Braga"],
                "correct": 0
            },
            {
                "question": "Em que ano foi descoberto o Brasil?",
                "options": ["1498", "1500", "1502", "1504"],
                "correct": 1
            },
            {
                "question": "Qual é o maior planeta do sistema solar?",
                "options": ["Terra", "Marte", "Júpiter", "Saturno"],
                "correct": 2
            },
            {
                "question": "Quem escreveu 'Os Lusíadas'?",
                "options": ["Fernando Pessoa", "Luís de Camões", "José Saramago", "Eça de Queirós"],
                "correct": 1
            },
            {
                "question": "Qual é a fórmula química da água?",
                "options": ["H2O", "CO2", "NaCl", "O2"],
                "correct": 0
            },
            {
                "question": "Em que continente fica o Egipto?",
                "options": ["Ásia", "Europa", "África", "América"],
                "correct": 2
            }
        ]
        
        self.forca_words = [
            ("PORTUGAL", "País europeu"), ("DISCORD", "Plataforma de comunicação"),
            ("PROGRAMACAO", "Criar software"), ("COMPUTADOR", "Máquina eletrônica"),
            ("INTERNET", "Rede mundial"), ("MUSICA", "Arte sonora"),
            ("FUTEBOL", "Desporto com bola"), ("PIZZA", "Comida italiana"),
            ("ELEFANTE", "Animal com tromba"), ("CHOCOLATE", "Doce de cacau"),
            ("GUITARRA", "Instrumento de cordas"), ("MONTANHA", "Elevação natural"),
            ("OCEANO", "Grande massa de água"), ("DIAMANTE", "Pedra preciosa"),
            ("FOGUETE", "Veículo espacial"), ("BIBLIOTECA", "Local com livros"),
            ("TSUNAMI", "Onda gigante"), ("VAMPIRO", "Criatura da noite"),
            ("DRAGAO", "Criatura mítica"), ("UNICORNIO", "Cavalo com chifre")
        ]
    
    async def cog_load(self):
        """Método chamado quando o cog é carregado"""
        self.db = await get_database()

    @app_commands.command(name="quiz", description="Jogo de perguntas e respostas")
    async def quiz(self, interaction: discord.Interaction):
        """Jogo de quiz com perguntas aleatórias"""
        user_id = interaction.user.id
        
        if user_id in self.active_games:
            await interaction.response.send_message("❌ Já tens um jogo ativo! Termina-o primeiro.", ephemeral=True)
            return
        
        # Escolher pergunta aleatória
        question_data = random.choice(self.quiz_questions)
        
        embed = discord.Embed(
            title="🧠 Quiz Time!",
            description=f"**{question_data['question']}**",
            color=discord.Color.blue()
        )
        
        # Adicionar opções
        options_text = ""
        for i, option in enumerate(question_data['options']):
            emoji = ["🇦", "🇧", "🇨", "🇩"][i]
            options_text += f"{emoji} {option}\n"
        
        embed.add_field(name="Opções:", value=options_text, inline=False)
        embed.add_field(name="⏱️ Tempo:", value="30 segundos para responder!", inline=False)
        embed.set_footer(text="Reage com a emoji da resposta correta!")
        
        message = await interaction.response.send_message(embed=embed)
        message = await interaction.original_response()
        
        # Adicionar reações
        emojis = ["🇦", "🇧", "🇨", "🇩"]
        for emoji in emojis:
            await message.add_reaction(emoji)
        
        # Guardar jogo ativo
        self.active_games[user_id] = {
            "type": "quiz",
            "correct_answer": question_data['correct'],
            "message": message,
            "answered": False
        }
        
        # Aguardar resposta
        def check(reaction, user):
            return (user.id == interaction.user.id and 
                   str(reaction.emoji) in emojis and 
                   reaction.message.id == message.id)
        
        try:
            reaction, user = await self.bot.wait_for('reaction_add', timeout=30.0, check=check)
            
            if user_id not in self.active_games or self.active_games[user_id]["answered"]:
                return
            
            self.active_games[user_id]["answered"] = True
            
            # Verificar resposta
            user_answer = emojis.index(str(reaction.emoji))
            correct_answer = question_data['correct']
            
            if user_answer == correct_answer:
                result_embed = discord.Embed(
                    title="✅ Correto!",
                    description=f"Parabéns {interaction.user.mention}! Respondeste corretamente!",
                    color=discord.Color.green()
                )
                # Dar recompensa (se tiver sistema de economia)
                try:
                    economy_cog = self.bot.get_cog("SimpleEconomy")
                    if economy_cog:
                        economy_cog.add_money(str(user_id), 50)
                        result_embed.add_field(name="💰 Recompensa", value="50 EPA Coins!", inline=False)
                except:
                    pass
            else:
                correct_option = question_data['options'][correct_answer]
                result_embed = discord.Embed(
                    title="❌ Incorreto!",
                    description=f"A resposta correta era: **{correct_option}**",
                    color=discord.Color.red()
                )
            
            await message.edit(embed=result_embed)
            
        except asyncio.TimeoutError:
            if user_id in self.active_games:
                timeout_embed = discord.Embed(
                    title="⏰ Tempo Esgotado!",
                    description=f"A resposta correta era: **{question_data['options'][question_data['correct']]}**",
                    color=discord.Color.orange()
                )
                await message.edit(embed=timeout_embed)
        
        finally:
            if user_id in self.active_games:
                del self.active_games[user_id]

    @app_commands.command(name="forca", description="Jogo da forca melhorado")
    async def forca(self, interaction: discord.Interaction):
        """Jogo da forca com interface de botões"""
        user_id = interaction.user.id
        
        if user_id in self.active_games:
            await interaction.response.send_message("❌ Já tens um jogo ativo! Termina-o primeiro.", ephemeral=True)
            return
        
        # Escolher palavra com dica
        word_data = random.choice(self.forca_words)
        word, hint = word_data
        
        # Criar view com botões de letras
        view = HangmanView(word, hint, user_id, self)
        
        # Criar embed inicial
        embed = view.create_embed()
        
        # Guardar jogo
        self.active_games[user_id] = {
            "type": "forca",
            "word": word,
            "view": view
        }
        
        await interaction.response.send_message(embed=embed, view=view)

    async def _show_forca_status(self, interaction, user_id, first_time=False):
        """Mostrar status do jogo da forca"""
        game = self.active_games[user_id]
        word = game["word"]
        guessed = game["guessed"]
        wrong = game["wrong"]
        max_wrong = game["max_wrong"]
        
        # Palavra com letras adivinhadas
        display_word = " ".join([letter if letter in guessed else "_" for letter in word])
        
        # Desenho da forca
        forca_stages = [
            "```\n  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========```",
            "```\n  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========```",
            "```\n  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========```",
            "```\n  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========```",
            "```\n  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========```",
            "```\n  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========```",
            "```\n  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n=========```"
        ]
        
        embed = discord.Embed(
            title="🎪 Jogo da Forca",
            color=discord.Color.blue()
        )
        
        embed.add_field(name="Palavra:", value=f"**{display_word}**", inline=False)
        embed.add_field(name="Forca:", value=forca_stages[wrong], inline=False)
        
        if guessed:
            embed.add_field(
                name="Letras tentadas:", 
                value=" ".join(sorted(guessed)), 
                inline=False
            )
        
        embed.add_field(
            name="Erros:", 
            value=f"{wrong}/{max_wrong}", 
            inline=True
        )
        
        # Verificar vitória/derrota
        if all(letter in guessed for letter in word):
            embed.title = "🎉 Vitória!"
            embed.color = discord.Color.green()
            embed.add_field(name="Resultado:", value="Parabéns! Adivinhaste a palavra!", inline=False)
            
            # Recompensa
            try:
                economy_cog = self.bot.get_cog("SimpleEconomy")
                if economy_cog:
                    economy_cog.add_money(str(user_id), 75)
                    embed.add_field(name="💰 Recompensa", value="75 EPA Coins!", inline=False)
            except:
                pass
            
            del self.active_games[user_id]
            
        elif wrong >= max_wrong:
            embed.title = "💀 Derrota!"
            embed.color = discord.Color.red()
            embed.add_field(name="Resultado:", value=f"A palavra era: **{word}**", inline=False)
            del self.active_games[user_id]
        else:
            embed.set_footer(text="Digite uma letra para continuar! (ou 'desistir' para parar)")
        
        if first_time:
            await interaction.response.send_message(embed=embed)
        else:
            await interaction.edit_original_response(embed=embed)

    @app_commands.command(name="blackjack", description="Jogo de Blackjack")
    @app_commands.describe(aposta="Quantia a apostar (mínimo 10)")
    async def blackjack(self, interaction: discord.Interaction, aposta: int = 10):
        """Jogo de Blackjack"""
        user_id = interaction.user.id
        
        if user_id in self.active_games:
            await interaction.response.send_message("❌ Já tens um jogo ativo! Termina-o primeiro.", ephemeral=True)
            return
        
        if aposta < 10:
            await interaction.response.send_message("❌ Aposta mínima é 10 EPA Coins!", ephemeral=True)
            return
        
        # Verificar saldo (se tiver economia)
        try:
            economy_cog = self.bot.get_cog("SimpleEconomy")
            if economy_cog:
                balance = economy_cog.get_balance(str(user_id))
                if balance < aposta:
                    await interaction.response.send_message(f"❌ Não tens EPA Coins suficientes! Saldo: {balance}", ephemeral=True)
                    return
                economy_cog.remove_money(str(user_id), aposta)
        except:
            await interaction.response.send_message("❌ Sistema de economia não disponível!", ephemeral=True)
            return
        
        # Criar baralho
        deck = []
        suits = ["♠️", "♥️", "♦️", "♣️"]
        ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]
        
        for suit in suits:
            for rank in ranks:
                deck.append({"suit": suit, "rank": rank})
        
        random.shuffle(deck)
        
        # Dar cartas
        player_hand = [deck.pop(), deck.pop()]
        dealer_hand = [deck.pop(), deck.pop()]
        
        # Guardar jogo
        self.active_games[user_id] = {
            "type": "blackjack",
            "deck": deck,
            "player_hand": player_hand,
            "dealer_hand": dealer_hand,
            "bet": aposta,
            "finished": False
        }
        
        await self._show_blackjack_status(interaction, user_id, first_time=True)

    def _calculate_hand_value(self, hand):
        """Calcular valor da mão no blackjack"""
        value = 0
        aces = 0
        
        for card in hand:
            rank = card["rank"]
            if rank in ["J", "Q", "K"]:
                value += 10
            elif rank == "A":
                aces += 1
                value += 11
            else:
                value += int(rank)
        
        # Ajustar ases
        while value > 21 and aces > 0:
            value -= 10
            aces -= 1
        
        return value

    def _format_hand(self, hand, hide_first=False):
        """Formatar mão para exibição"""
        if hide_first:
            return f"🂠 {hand[1]['rank']}{hand[1]['suit']}"
        else:
            return " ".join([f"{card['rank']}{card['suit']}" for card in hand])

    async def _show_blackjack_status(self, interaction, user_id, first_time=False):
        """Mostrar status do blackjack"""
        game = self.active_games[user_id]
        player_hand = game["player_hand"]
        dealer_hand = game["dealer_hand"]
        bet = game["bet"]
        finished = game["finished"]
        
        player_value = self._calculate_hand_value(player_hand)
        dealer_value = self._calculate_hand_value(dealer_hand)
        
        embed = discord.Embed(
            title="🃏 Blackjack",
            color=discord.Color.blue()
        )
        
        # Mão do jogador
        embed.add_field(
            name=f"🧑 Tuas Cartas (Valor: {player_value})",
            value=self._format_hand(player_hand),
            inline=False
        )
        
        # Mão do dealer
        if finished:
            embed.add_field(
                name=f"🤵 Cartas do Dealer (Valor: {dealer_value})",
                value=self._format_hand(dealer_hand),
                inline=False
            )
        else:
            embed.add_field(
                name="🤵 Cartas do Dealer",
                value=self._format_hand(dealer_hand, hide_first=True),
                inline=False
            )
        
        embed.add_field(name="💰 Aposta", value=f"{bet} EPA Coins", inline=True)
        
        # Verificar estados do jogo
        if player_value > 21:
            # Bust do jogador
            embed.title = "💥 Bust!"
            embed.color = discord.Color.red()
            embed.add_field(name="Resultado:", value="Perdeste! Ultrapassaste 21.", inline=False)
            game["finished"] = True
            del self.active_games[user_id]
            
        elif finished:
            # Jogo terminado, ver quem ganhou
            if dealer_value > 21:
                # Dealer bust
                embed.title = "🎉 Vitória!"
                embed.color = discord.Color.green()
                embed.add_field(name="Resultado:", value="Dealer ultrapassou 21! Ganhaste!", inline=False)
                
                # Recompensa
                try:
                    economy_cog = self.bot.get_cog("SimpleEconomy")
                    if economy_cog:
                        economy_cog.add_money(str(user_id), bet * 2)
                        embed.add_field(name="💰 Ganhos", value=f"{bet * 2} EPA Coins!", inline=False)
                except:
                    pass
                
            elif player_value > dealer_value:
                # Jogador ganhou
                embed.title = "🎉 Vitória!"
                embed.color = discord.Color.green()
                embed.add_field(name="Resultado:", value="Tens mais pontos que o dealer!", inline=False)
                
                # Recompensa
                try:
                    economy_cog = self.bot.get_cog("SimpleEconomy")
                    if economy_cog:
                        economy_cog.add_money(str(user_id), bet * 2)
                        embed.add_field(name="💰 Ganhos", value=f"{bet * 2} EPA Coins!", inline=False)
                except:
                    pass
                    
            elif player_value == dealer_value:
                # Empate
                embed.title = "🤝 Empate!"
                embed.color = discord.Color.orange()
                embed.add_field(name="Resultado:", value="Empate! Recebes a aposta de volta.", inline=False)
                
                # Devolver aposta
                try:
                    economy_cog = self.bot.get_cog("SimpleEconomy")
                    if economy_cog:
                        economy_cog.add_money(str(user_id), bet)
                except:
                    pass
                    
            else:
                # Dealer ganhou
                embed.title = "😞 Derrota!"
                embed.color = discord.Color.red()
                embed.add_field(name="Resultado:", value="Dealer tem mais pontos. Perdeste!", inline=False)
            
            del self.active_games[user_id]
            
        else:
            # Jogo continua
            if player_value == 21:
                embed.add_field(name="🎯", value="Blackjack! Clica 'Parar' para finalizar.", inline=False)
            embed.set_footer(text="Use os botões para continuar!")
        
        # Criar botões se o jogo não terminou
        view = None
        if not finished and player_value <= 21 and user_id in self.active_games:
            view = BlackjackView(self, user_id)
        
        if first_time:
            await interaction.response.send_message(embed=embed, view=view)
        else:
            # Para interações de botões, usar response.edit_message
            await interaction.response.edit_message(embed=embed, view=view)

    @app_commands.command(name="memes", description="Envia um meme aleatório")
    async def memes(self, interaction: discord.Interaction):
        """Envia memes aleatórios"""
        await interaction.response.defer()
        
        try:
            # Tentar buscar meme do Reddit
            async with aiohttp.ClientSession() as session:
                async with session.get("https://meme-api.herokuapp.com/gimme") as response:
                    if response.status == 200:
                        data = await response.json()
                        
                        embed = discord.Embed(
                            title=data.get("title", "Meme Aleatório"),
                            color=discord.Color.random()
                        )
                        
                        embed.set_image(url=data["url"])
                        embed.add_field(
                            name="📊 Reddit",
                            value=f"r/{data.get('subreddit', 'unknown')} • ⬆️ {data.get('ups', 0)}",
                            inline=True
                        )
                        embed.set_footer(text=f"Solicitado por {interaction.user.display_name}")
                        
                        await interaction.followup.send(embed=embed)
                        return
        except:
            pass
        
        # Fallback: memes locais/texto
        memes_texto = [
            "https://i.imgur.com/3sKw9sF.jpg",  # Placeholder
            "https://i.imgur.com/VQWPsBS.jpg",  # Placeholder
            "Por que os programadores preferem o modo escuro?\nPorque a luz atrai bugs! 🐛",
            "Como se chama um bot que não funciona?\nUm chat! 💬",
            "Por que o Discord é azul?\nPorque os developers estavam tristes! 😢"
        ]
        
        meme = random.choice(memes_texto)
        
        if meme.startswith("http"):
            embed = discord.Embed(title="😂 Meme Aleatório", color=discord.Color.random())
            embed.set_image(url=meme)
        else:
            embed = discord.Embed(
                title="😂 Piada do Dia",
                description=meme,
                color=discord.Color.random()
            )
        
        embed.set_footer(text=f"Solicitado por {interaction.user.display_name}")
        await interaction.followup.send(embed=embed)

    @commands.Cog.listener()
    async def on_message(self, message):
        """Listener para jogos que requerem input de texto"""
        if message.author.bot:
            return
        
        user_id = message.author.id
        
        if user_id not in self.active_games:
            return
        
        game = self.active_games[user_id]
        
        if game["type"] == "forca":
            content = message.content.upper().strip()
            
            if content == "DESISTIR":
                embed = discord.Embed(
                    title="🏳️ Desistência",
                    description=f"Desististe! A palavra era: **{game['word']}**",
                    color=discord.Color.orange()
                )
                await message.channel.send(embed=embed)
                del self.active_games[user_id]
                return
            
            if len(content) == 1 and content.isalpha():
                letter = content
                
                if letter in game["guessed"]:
                    await message.channel.send(f"❌ Já tentaste a letra **{letter}**!", delete_after=3)
                    return
                
                game["guessed"].add(letter)
                
                if letter in game["word"]:
                    await message.channel.send(f"✅ A letra **{letter}** está na palavra!", delete_after=3)
                else:
                    game["wrong"] += 1
                    await message.channel.send(f"❌ A letra **{letter}** não está na palavra!", delete_after=3)
                
                # Criar uma interação fake para mostrar status
                class FakeInteraction:
                    def __init__(self, original_message):
                        self.user = original_message.author
                        self.channel = original_message.channel
                        self.guild = original_message.guild
                    
                    async def edit_original_response(self, **kwargs):
                        # Encontrar a mensagem original do jogo e editá-la
                        async for msg in self.channel.history(limit=50):
                            if (msg.author == self.channel.guild.me and 
                                msg.embeds and 
                                "Jogo da Forca" in msg.embeds[0].title):
                                await msg.edit(**kwargs)
                                break
                
                fake_interaction = FakeInteraction(message)
                await self._show_forca_status(fake_interaction, user_id)
                
                try:
                    await message.delete()
                except:
                    pass

    @app_commands.command(name="reacao", description="Mini-jogo de reação rápida")
    async def reaction_game(self, interaction: discord.Interaction):
        """Jogo de reação - clica no emoji correto o mais rápido possível!"""
        emojis = ["🍎", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🍒", "🥝", "🍑"]
        target_emoji = random.choice(emojis)
        
        # Embaralhar emojis
        button_emojis = random.sample(emojis, 5)
        if target_emoji not in button_emojis:
            button_emojis[random.randint(0, 4)] = target_emoji
        random.shuffle(button_emojis)
        
        embed = discord.Embed(
            title="⚡ Jogo de Reação Rápida!",
            description=f"**Clica no:** {target_emoji}\n\n⏱️ O mais rápido possível!",
            color=discord.Color.orange()
        )
        
        view = ReactionGameView(target_emoji, button_emojis, interaction.user.id, self)
        view.start_time = asyncio.get_event_loop().time()
        
        await interaction.response.send_message(embed=embed, view=view)

    @app_commands.command(name="matematica", description="Desafio matemático rápido")
    async def math_challenge(self, interaction: discord.Interaction):
        """Resolve um problema matemático o mais rápido possível!"""
        operations = ['+', '-', '*']
        operation = random.choice(operations)
        
        if operation == '+':
            num1 = random.randint(10, 50)
            num2 = random.randint(10, 50)
            answer = num1 + num2
            question = f"{num1} + {num2}"
        elif operation == '-':
            num1 = random.randint(20, 100)
            num2 = random.randint(10, num1)
            answer = num1 - num2
            question = f"{num1} - {num2}"
        else:  # *
            num1 = random.randint(5, 15)
            num2 = random.randint(2, 12)
            answer = num1 * num2
            question = f"{num1} × {num2}"
        
        # Gerar opções (resposta correta + 3 erradas)
        options = [answer]
        while len(options) < 4:
            wrong = answer + random.randint(-10, 10)
            if wrong not in options and wrong > 0:
                options.append(wrong)
        
        random.shuffle(options)
        
        embed = discord.Embed(
            title="🧮 Desafio Matemático!",
            description=f"**Quanto é:** {question} = ?\n\n⏱️ Responde rápido!",
            color=discord.Color.blue()
        )
        
        view = MathGameView(answer, options, interaction.user.id, self)
        view.start_time = asyncio.get_event_loop().time()
        
        await interaction.response.send_message(embed=embed, view=view)

    @app_commands.command(name="memoria", description="Jogo de memória com emojis")
    async def memory_game(self, interaction: discord.Interaction):
        """Memoriza e encontra os pares de emojis!"""
        emojis = ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊"]
        pairs = random.sample(emojis, 3)
        card_emojis = pairs + pairs  # Duplicar para criar pares
        random.shuffle(card_emojis)
        
        embed = discord.Embed(
            title="🧠 Jogo de Memória!",
            description="Encontra todos os pares de emojis!\n\nClica nas cartas para revelar.",
            color=discord.Color.purple()
        )
        
        view = MemoryGameView(card_emojis, interaction.user.id, self)
        
        await interaction.response.send_message(embed=embed, view=view)


class BlackjackView(discord.ui.View):
    """View para botões do Blackjack"""
    
    def __init__(self, cog, user_id):
        super().__init__(timeout=60)
        self.cog = cog
        self.user_id = user_id
    
    @discord.ui.button(label="🃏 Pedir Carta", style=discord.ButtonStyle.primary)
    async def hit(self, interaction: discord.Interaction, button: discord.ui.Button):
        if interaction.user.id != self.user_id:
            await interaction.response.send_message("❌ Este não é o teu jogo!", ephemeral=True)
            return
        
        if self.user_id not in self.cog.active_games:
            await interaction.response.send_message("❌ Jogo não encontrado!", ephemeral=True)
            return
        
        game = self.cog.active_games[self.user_id]
        
        # Dar nova carta
        if len(game["deck"]) > 0:
            new_card = game["deck"].pop()
            game["player_hand"].append(new_card)
        
        await self.cog._show_blackjack_status(interaction, self.user_id)
    
    @discord.ui.button(label="✋ Parar", style=discord.ButtonStyle.secondary)
    async def stand(self, interaction: discord.Interaction, button: discord.ui.Button):
        if interaction.user.id != self.user_id:
            await interaction.response.send_message("❌ Este não é o teu jogo!", ephemeral=True)
            return
        
        if self.user_id not in self.cog.active_games:
            await interaction.response.send_message("❌ Jogo não encontrado!", ephemeral=True)
            return
        
        game = self.cog.active_games[self.user_id]
        
        # Dealer joga
        while self.cog._calculate_hand_value(game["dealer_hand"]) < 17:
            if len(game["deck"]) > 0:
                new_card = game["deck"].pop()
                game["dealer_hand"].append(new_card)
            else:
                break
        
        game["finished"] = True
        await self.cog._show_blackjack_status(interaction, self.user_id)


class ReactionGameView(discord.ui.View):
    """View para jogo de reação"""
    
    def __init__(self, target_emoji: str, button_emojis: list, user_id: int, cog):
        super().__init__(timeout=10)
        self.target_emoji = target_emoji
        self.user_id = user_id
        self.cog = cog
        self.start_time = None
        self.finished = False
        
        for emoji in button_emojis:
            button = discord.ui.Button(
                emoji=emoji,
                style=discord.ButtonStyle.primary,
                custom_id=f"reaction_{emoji}"
            )
            button.callback = self.make_callback(emoji)
            self.add_item(button)
    
    def make_callback(self, emoji: str):
        async def callback(interaction: discord.Interaction):
            if self.finished:
                return
            
            if interaction.user.id != self.user_id:
                await interaction.response.send_message("❌ Não é o teu jogo!", ephemeral=True)
                return
            
            self.finished = True
            reaction_time = asyncio.get_event_loop().time() - self.start_time
            
            for item in self.children:
                item.disabled = True
            
            if emoji == self.target_emoji:
                reward = max(10, int(50 - reaction_time * 5))
                
                embed = discord.Embed(
                    title="🎉 Correto!",
                    description=f"Tempo de reação: **{reaction_time:.2f}s**",
                    color=discord.Color.green()
                )
                embed.add_field(name="💰 Recompensa", value=f"{reward} EPA Coins")
                
                # Dar recompensa
                try:
                    economy_cog = self.cog.bot.get_cog("SimpleEconomy")
                    if economy_cog:
                        economy_cog.add_money(str(self.user_id), reward)
                except:
                    pass
            else:
                embed = discord.Embed(
                    title="❌ Errado!",
                    description=f"O emoji correto era {self.target_emoji}",
                    color=discord.Color.red()
                )
            
            await interaction.response.edit_message(embed=embed, view=self)
        
        return callback


class MathGameView(discord.ui.View):
    """View para desafio matemático"""
    
    def __init__(self, answer: int, options: list, user_id: int, cog):
        super().__init__(timeout=15)
        self.answer = answer
        self.user_id = user_id
        self.cog = cog
        self.start_time = None
        self.finished = False
        
        for option in options:
            button = discord.ui.Button(
                label=str(option),
                style=discord.ButtonStyle.primary,
                custom_id=f"math_{option}"
            )
            button.callback = self.make_callback(option)
            self.add_item(button)
    
    def make_callback(self, option: int):
        async def callback(interaction: discord.Interaction):
            if self.finished:
                return
            
            if interaction.user.id != self.user_id:
                await interaction.response.send_message("❌ Não é o teu jogo!", ephemeral=True)
                return
            
            self.finished = True
            reaction_time = asyncio.get_event_loop().time() - self.start_time
            
            for item in self.children:
                item.disabled = True
            
            if option == self.answer:
                reward = max(15, int(75 - reaction_time * 10))
                
                embed = discord.Embed(
                    title="🎉 Correto!",
                    description=f"Tempo: **{reaction_time:.2f}s**\nResposta: **{self.answer}**",
                    color=discord.Color.green()
                )
                embed.add_field(name="💰 Recompensa", value=f"{reward} EPA Coins")
                
                try:
                    economy_cog = self.cog.bot.get_cog("SimpleEconomy")
                    if economy_cog:
                        economy_cog.add_money(str(self.user_id), reward)
                except:
                    pass
            else:
                embed = discord.Embed(
                    title="❌ Errado!",
                    description=f"A resposta correta era: **{self.answer}**",
                    color=discord.Color.red()
                )
            
            await interaction.response.edit_message(embed=embed, view=self)
        
        return callback


class MemoryGameView(discord.ui.View):
    """View para jogo de memória"""
    
    def __init__(self, card_emojis: list, user_id: int, cog):
        super().__init__(timeout=60)
        self.card_emojis = card_emojis
        self.user_id = user_id
        self.cog = cog
        self.revealed = [False] * len(card_emojis)
        self.matched = [False] * len(card_emojis)
        self.first_card = None
        self.moves = 0
        
        self.update_buttons()
    
    def update_buttons(self):
        self.clear_items()
        
        for i in range(6):
            if self.matched[i]:
                button = discord.ui.Button(
                    emoji=self.card_emojis[i],
                    style=discord.ButtonStyle.success,
                    disabled=True,
                    row=i // 3
                )
            elif self.revealed[i]:
                button = discord.ui.Button(
                    emoji=self.card_emojis[i],
                    style=discord.ButtonStyle.primary,
                    disabled=True,
                    row=i // 3
                )
            else:
                button = discord.ui.Button(
                    label="❓",
                    style=discord.ButtonStyle.secondary,
                    custom_id=f"memory_{i}",
                    row=i // 3
                )
                button.callback = self.make_callback(i)
            
            self.add_item(button)
    
    def make_callback(self, index: int):
        async def callback(interaction: discord.Interaction):
            if interaction.user.id != self.user_id:
                await interaction.response.send_message("❌ Não é o teu jogo!", ephemeral=True)
                return
            
            if self.revealed[index] or self.matched[index]:
                await interaction.response.defer()
                return
            
            self.revealed[index] = True
            self.moves += 1
            
            if self.first_card is None:
                # Primeira carta revelada
                self.first_card = index
                self.update_buttons()
                
                embed = discord.Embed(
                    title="🧠 Jogo de Memória",
                    description=f"Jogadas: {self.moves}\nEscolhe outra carta!",
                    color=discord.Color.purple()
                )
                
                await interaction.response.edit_message(embed=embed, view=self)
            else:
                # Segunda carta revelada
                if self.card_emojis[self.first_card] == self.card_emojis[index]:
                    # Par encontrado!
                    self.matched[self.first_card] = True
                    self.matched[index] = True
                    
                    # Verificar vitória
                    if all(self.matched):
                        reward = max(50, 150 - self.moves * 10)
                        
                        embed = discord.Embed(
                            title="🎉 Parabéns!",
                            description=f"Encontraste todos os pares em **{self.moves}** jogadas!",
                            color=discord.Color.gold()
                        )
                        embed.add_field(name="💰 Recompensa", value=f"{reward} EPA Coins")
                        
                        try:
                            economy_cog = self.cog.bot.get_cog("SimpleEconomy")
                            if economy_cog:
                                economy_cog.add_money(str(self.user_id), reward)
                        except:
                            pass
                        
                        for item in self.children:
                            item.disabled = True
                    else:
                        embed = discord.Embed(
                            title="🧠 Jogo de Memória",
                            description=f"✅ Par encontrado!\nJogadas: {self.moves}",
                            color=discord.Color.green()
                        )
                else:
                    # Não é um par
                    await asyncio.sleep(1)
                    self.revealed[self.first_card] = False
                    self.revealed[index] = False
                    
                    embed = discord.Embed(
                        title="🧠 Jogo de Memória",
                        description=f"❌ Não é um par!\nJogadas: {self.moves}",
                        color=discord.Color.orange()
                    )
                
                self.first_card = None
                self.update_buttons()
                await interaction.response.edit_message(embed=embed, view=self)
        
        return callback


async def setup(bot):
    """Função para carregar o cog"""
    await bot.add_cog(GamesExtraCog(bot))
