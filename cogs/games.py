import discord
from discord.ext import commands
import random
from typing import List, Optional


class TicTacToeButton(discord.ui.Button):
    """Botão individual do jogo do galo"""
    
    def __init__(self, x: int, y: int):
        super().__init__(style=discord.ButtonStyle.secondary, label=" ", row=y)
        self.x = x
        self.y = y

    async def callback(self, interaction: discord.Interaction):
        """Callback executado quando o botão é clicado"""
        view: TicTacToeView = self.view
        
        # Verificar se é a vez do jogador
        if interaction.user != view.current_player_user:
            await interaction.response.send_message(
                "❌ Não é a tua vez!",
                ephemeral=True
            )
            return
        
        # Verificar se a posição está ocupada
        if view.board[self.y][self.x] != " ":
            await interaction.response.send_message(
                "❌ Esta posição já está ocupada!",
                ephemeral=True
            )
            return
        
        # Fazer a jogada
        view.board[self.y][self.x] = view.current_symbol
        self.label = view.current_symbol
        self.style = discord.ButtonStyle.success if view.current_symbol == "X" else discord.ButtonStyle.danger
        self.disabled = True
        
        # Verificar vencedor
        winner = view.check_winner()
        if winner:
            for button in view.children:
                if isinstance(button, TicTacToeButton):
                    button.disabled = True
            
            embed = discord.Embed(
                title="🎉 Jogo Terminado!",
                description=f"**Vencedor:** {view.current_player_user.mention} ({winner})",
                color=discord.Color.green()
            )
            embed.set_footer(text="EPA Bot • Jogo do Galo")
            
            await interaction.response.edit_message(embed=embed, view=view)
            return
        
        # Verificar empate
        if view.is_tied():
            for button in view.children:
                if isinstance(button, TicTacToeButton):
                    button.disabled = True
            
            embed = discord.Embed(
                title="🤝 Empate!",
                description="O jogo terminou sem vencedor!",
                color=discord.Color.orange()
            )
            embed.set_footer(text="EPA Bot • Jogo do Galo")
            
            await interaction.response.edit_message(embed=embed, view=view)
            return
        
        # Próximo jogador
        view.switch_player()
        
        # Se é modo single player e é a vez do bot
        if view.is_single_player and view.current_player_user is None:
            view.make_bot_move()
            
            # Verificar vencedor após jogada do bot
            winner = view.check_winner()
            if winner:
                for button in view.children:
                    if isinstance(button, TicTacToeButton):
                        button.disabled = True
                
                embed = discord.Embed(
                    title="� Jogo Terminado!",
                    description=f"**Vencedor:** {'EPA BOT' if winner == 'O' else view.player1.mention} ({winner})",
                    color=discord.Color.red() if winner == 'O' else discord.Color.green()
                )
                embed.set_footer(text="EPA Bot • Jogo do Galo")
                
                await interaction.response.edit_message(embed=embed, view=view)
                return
            
            # Verificar empate após jogada do bot
            if view.is_tied():
                for button in view.children:
                    if isinstance(button, TicTacToeButton):
                        button.disabled = True
                
                embed = discord.Embed(
                    title="🤝 Empate!",
                    description="O jogo terminou sem vencedor!",
                    color=discord.Color.orange()
                )
                embed.set_footer(text="EPA Bot • Jogo do Galo")
                
                await interaction.response.edit_message(embed=embed, view=view)
                return
            
            # Voltar para o jogador humano
            view.switch_player()
        
        embed = discord.Embed(
            title="�🎮 Jogo do Galo",
            description=f"**Vez de:** {view.current_player_user.mention if view.current_player_user else 'EPA BOT'} ({view.current_symbol})",
            color=discord.Color.blue()
        )
        embed.set_footer(text="EPA Bot • Jogo do Galo")
        
        await interaction.response.edit_message(embed=embed, view=view)


class TicTacToeView(discord.ui.View):
    """View principal do jogo do galo"""
    
    def __init__(self, player1: discord.Member, player2: Optional[discord.Member] = None):
        super().__init__(timeout=300)
        
        self.player1 = player1
        self.player2 = player2  # None para modo single player
        self.board = [[" " for _ in range(3)] for _ in range(3)]
        self.current_symbol = "X"
        self.current_player_user = player1
        self.is_single_player = player2 is None
        
        # Adicionar botões do tabuleiro
        for y in range(3):
            for x in range(3):
                self.add_item(TicTacToeButton(x, y))
    
    def switch_player(self):
        """Alterna entre os jogadores"""
        if self.current_symbol == "X":
            self.current_symbol = "O"
            if self.is_single_player:
                self.current_player_user = None  # Bot's turn
            else:
                self.current_player_user = self.player2
        else:
            self.current_symbol = "X"
            self.current_player_user = self.player1
    
    def check_winner(self) -> Optional[str]:
        """Verifica se há um vencedor"""
        # Verificar linhas
        for row in self.board:
            if row[0] == row[1] == row[2] != " ":
                return row[0]
        
        # Verificar colunas
        for col in range(3):
            if self.board[0][col] == self.board[1][col] == self.board[2][col] != " ":
                return self.board[0][col]
        
        # Verificar diagonais
        if self.board[0][0] == self.board[1][1] == self.board[2][2] != " ":
            return self.board[0][0]
        if self.board[0][2] == self.board[1][1] == self.board[2][0] != " ":
            return self.board[0][2]
        
        return None
    
    def is_tied(self) -> bool:
        """Verifica se houve empate"""
        return all(cell != " " for row in self.board for cell in row)
    
    def get_available_moves(self) -> List[tuple]:
        """Retorna movimentos disponíveis para o bot"""
        moves = []
        for y in range(3):
            for x in range(3):
                if self.board[y][x] == " ":
                    moves.append((x, y))
        return moves
    
    def make_bot_move(self):
        """Faz a jogada do bot (modo single player)"""
        if not self.is_single_player or self.current_player_user is not None:
            return
        
        # Estratégia simples do bot
        available_moves = self.get_available_moves()
        if not available_moves:
            return
        
        # 1. Tentar vencer
        for x, y in available_moves:
            self.board[y][x] = "O"
            if self.check_winner() == "O":
                self._execute_bot_move(x, y)
                return
            self.board[y][x] = " "
        
        # 2. Bloquear vitória do jogador
        for x, y in available_moves:
            self.board[y][x] = "X"
            if self.check_winner() == "X":
                self.board[y][x] = " "
                self._execute_bot_move(x, y)
                return
            self.board[y][x] = " "
        
        # 3. Jogar no centro se disponível
        if (1, 1) in available_moves:
            self._execute_bot_move(1, 1)
            return
        
        # 4. Jogar nos cantos
        corners = [(0, 0), (0, 2), (2, 0), (2, 2)]
        available_corners = [move for move in available_moves if move in corners]
        if available_corners:
            x, y = random.choice(available_corners)
            self._execute_bot_move(x, y)
            return
        
        # 5. Jogar em qualquer lugar
        x, y = random.choice(available_moves)
        self._execute_bot_move(x, y)
    
    def _execute_bot_move(self, x: int, y: int):
        """Executa a jogada do bot"""
        self.board[y][x] = "O"
        
        # Encontrar e atualizar o botão correspondente
        for item in self.children:
            if isinstance(item, TicTacToeButton) and item.x == x and item.y == y:
                item.label = "O"
                item.style = discord.ButtonStyle.danger
                item.disabled = True
                break
    
    async def on_timeout(self):
        """Executado quando o timeout é atingido"""
        for item in self.children:
            item.disabled = True


class GamesCog(commands.Cog):
    """Cog para jogos interativos"""
    
    def __init__(self, bot):
        self.bot = bot

    async def cog_load(self):
        """Método chamado quando o cog é carregado"""
        pass

    @discord.app_commands.command(name="jogodogalo", description="Inicia um jogo do galo")
    @discord.app_commands.describe(oponente="Utilizador para jogar contra (opcional, deixe em branco para jogar contra o bot)")
    async def tic_tac_toe(self, interaction: discord.Interaction, oponente: Optional[discord.Member] = None):
        """
        Inicia um jogo do galo
        
        Args:
            oponente: Utilizador para jogar contra (opcional, deixe em branco para jogar contra o bot)
        """
        if oponente == interaction.user:
            await interaction.response.send_message("❌ Não podes jogar contra ti próprio!", ephemeral=True)
            return
        
        if oponente and oponente.bot:
            await interaction.response.send_message("❌ Não podes jogar contra outros bots!", ephemeral=True)
            return
        
        # Determinar modo de jogo
        if oponente is None:
            # Modo single player
            embed = discord.Embed(
                title="🎮 Jogo do Galo - Vs Bot",
                description=f"**Jogador:** {interaction.user.mention} (X)\n**Bot:** EPA BOT (O)\n\n**Vez de:** {interaction.user.mention}",
                color=discord.Color.blue()
            )
            view = TicTacToeView(interaction.user, None)
        else:
            # Modo multiplayer
            embed = discord.Embed(
                title="🎮 Jogo do Galo - Multiplayer",
                description=f"**Jogador 1:** {interaction.user.mention} (X)\n**Jogador 2:** {oponente.mention} (O)\n\n**Vez de:** {interaction.user.mention}",
                color=discord.Color.blue()
            )
            view = TicTacToeView(interaction.user, oponente)
        
        embed.set_footer(text="EPA Bot • Jogo do Galo • Timeout: 5 minutos")
        
        await interaction.response.send_message(embed=embed, view=view)

    @discord.app_commands.command(name="coinflip", description="Cara ou coroa")
    @discord.app_commands.describe(escolha="A tua escolha (cara/coroa) - opcional")
    async def coin_flip(self, interaction: discord.Interaction, escolha: Optional[str] = None):
        """
        Cara ou coroa
        
        Args:
            escolha: A tua escolha (cara/coroa) - opcional
        """
        resultado = random.choice(["cara", "coroa"])
        emoji = "🪙" if resultado == "cara" else "🥇"
        
        embed = discord.Embed(
            title=f"{emoji} Cara ou Coroa",
            color=discord.Color.gold()
        )
        
        if escolha:
            escolha = escolha.lower()
            if escolha not in ["cara", "coroa"]:
                await interaction.response.send_message("❌ Escolha 'cara' ou 'coroa'!", ephemeral=True)
                return
            
            if escolha == resultado:
                embed.description = f"**Resultado:** {resultado.title()}\n\n🎉 **Ganhou!**"
                embed.color = discord.Color.green()
            else:
                embed.description = f"**Resultado:** {resultado.title()}\n\n😔 **Perdeu!**"
                embed.color = discord.Color.red()
        else:
            embed.description = f"**Resultado:** {resultado.title()}"
        
        embed.set_footer(text=f"Solicitado por {interaction.user.display_name}")
        await interaction.response.send_message(embed=embed)



async def setup(bot):
    """Função para carregar o cog"""
    await bot.add_cog(GamesCog(bot))
