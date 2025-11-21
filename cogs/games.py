import discord
from discord.ext import commands
from discord import app_commands
import random
import asyncio
from typing import List, Optional
from utils.database import get_database


class ChallengeView(discord.ui.View):
    """View para aceitar/recusar desafio do jogo do galo"""
    
    def __init__(self, challenger: discord.Member, challenged: discord.Member):
        super().__init__(timeout=60.0)
        self.challenger = challenger
        self.challenged = challenged
        self.accepted = None
        
    @discord.ui.button(label="✅ Aceitar", style=discord.ButtonStyle.success)
    async def accept_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        """Aceitar o desafio"""
        if interaction.user.id != self.challenged.id:
            return await interaction.response.send_message("❌ Este desafio não é para ti!", ephemeral=True)
        
        self.accepted = True
        self.stop()
        
        # Desabilitar botões
        for item in self.children:
            item.disabled = True
        
        embed = discord.Embed(
            title="✅ Desafio Aceite!",
            description=f"{self.challenged.mention} aceitou o desafio de {self.challenger.mention}!\n\nO jogo vai começar...",
            color=discord.Color.green()
        )
        await interaction.response.edit_message(embed=embed, view=self)
    
    @discord.ui.button(label="❌ Recusar", style=discord.ButtonStyle.danger)
    async def decline_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        """Recusar o desafio"""
        if interaction.user.id != self.challenged.id:
            return await interaction.response.send_message("❌ Este desafio não é para ti!", ephemeral=True)
        
        self.accepted = False
        self.stop()
        
        # Desabilitar botões
        for item in self.children:
            item.disabled = True
        
        embed = discord.Embed(
            title="❌ Desafio Recusado",
            description=f"{self.challenged.mention} recusou o desafio de {self.challenger.mention}.",
            color=discord.Color.red()
        )
        await interaction.response.edit_message(embed=embed, view=self)
    
    async def on_timeout(self):
        """Timeout - desafio expirou"""
        self.accepted = False
        for item in self.children:
            item.disabled = True


class TicTacToeButton(discord.ui.Button):
    """Botão individual do jogo do galo"""
    
    def __init__(self, x: int, y: int):
        super().__init__(style=discord.ButtonStyle.secondary, label="⬜", row=y)
        self.x = x
        self.y = y

    async def callback(self, interaction: discord.Interaction):
        """Callback executado quando o botão é clicado"""
        view: TicTacToeView = self.view
        
        # Verificar se é a vez do jogador
        if interaction.user != view.current_player_user:
            return await interaction.response.send_message("❌ Não é a tua vez!", ephemeral=True)
        
        # Verificar se a posição está ocupada
        if view.board[self.y][self.x] != " ":
            return await interaction.response.send_message("❌ Esta posição já está ocupada!", ephemeral=True)
        
        # Resetar timer
        view.reset_turn_timer()
        
        # Fazer a jogada
        view.board[self.y][self.x] = view.current_symbol
        self.label = "❌" if view.current_symbol == "X" else "⭕"
        self.style = discord.ButtonStyle.success if view.current_symbol == "X" else discord.ButtonStyle.danger
        self.disabled = True
        
        # Verificar vencedor
        winner = view.check_winner()
        if winner:
            view.cancel_turn_timer()
            view.disable_all_buttons()
            embed = view.create_embed(f"🎉 **{view.current_player_user.mention}** venceu!", discord.Color.green())
            return await interaction.response.edit_message(embed=embed, view=view)
        
        # Verificar empate
        if view.is_tied():
            view.cancel_turn_timer()
            view.disable_all_buttons()
            embed = view.create_embed("🤝 **Empate!** Ninguém ganhou!", discord.Color.orange())
            return await interaction.response.edit_message(embed=embed, view=view)
        
        # Próximo jogador
        view.switch_player()
        
        # Se é modo single player e é a vez do bot
        if view.is_single_player and view.current_player_user is None:
            view.make_bot_move()
            
            # Verificar vencedor após jogada do bot
            winner = view.check_winner()
            if winner:
                view.cancel_turn_timer()
                view.disable_all_buttons()
                embed = view.create_embed("🤖 **EPA BOT** venceu!", discord.Color.red())
                return await interaction.response.edit_message(embed=embed, view=view)
            
            # Verificar empate após jogada do bot
            if view.is_tied():
                view.cancel_turn_timer()
                view.disable_all_buttons()
                embed = view.create_embed("🤝 **Empate!** Ninguém ganhou!", discord.Color.orange())
                return await interaction.response.edit_message(embed=embed, view=view)
            
            # Voltar para o jogador humano
            view.switch_player()
        
        # Atualizar embed para próxima jogada
        player_name = view.current_player_user.mention if view.current_player_user else "**EPA BOT**"
        symbol = "❌" if view.current_symbol == "X" else "⭕"
        embed = view.create_embed(f"Vez de {player_name} ({symbol})", discord.Color.blue())
        await interaction.response.edit_message(embed=embed, view=view)


class TicTacToeView(discord.ui.View):
    """View principal do jogo do galo"""
    
    def __init__(self, player1: discord.Member, player2: Optional[discord.Member] = None, channel = None):
        super().__init__(timeout=None)  # Sem timeout global, usamos timer manual
        
        self.player1 = player1
        self.player2 = player2  # None para modo single player
        self.board = [[" " for _ in range(3)] for _ in range(3)]
        self.current_symbol = "X"
        self.current_player_user = player1
        self.is_single_player = player2 is None
        self.channel = channel
        self.turn_timer_task = None
        self.message = None
        
        # Adicionar botões do tabuleiro
        for y in range(3):
            for x in range(3):
                self.add_item(TicTacToeButton(x, y))
    
    def start_turn_timer(self):
        """Iniciar timer de 30 segundos para a jogada"""
        if self.turn_timer_task:
            self.turn_timer_task.cancel()
        
        if not self.is_single_player and self.current_player_user:
            self.turn_timer_task = asyncio.create_task(self._turn_timeout())
    
    def reset_turn_timer(self):
        """Resetar timer da jogada"""
        if self.turn_timer_task:
            self.turn_timer_task.cancel()
        self.start_turn_timer()
    
    def cancel_turn_timer(self):
        """Cancelar timer da jogada"""
        if self.turn_timer_task:
            self.turn_timer_task.cancel()
            self.turn_timer_task = None
    
    async def _turn_timeout(self):
        """Timeout de 30 segundos - jogador atual perde"""
        try:
            await asyncio.sleep(30)
            
            # Jogador atual perdeu por timeout
            winner = self.player2 if self.current_player_user == self.player1 else self.player1
            
            self.disable_all_buttons()
            embed = discord.Embed(
                title="⏰ Tempo Esgotado!",
                description=f"{self.current_player_user.mention} demorou mais de 30 segundos!\n\n🎉 **{winner.mention}** vence por desistência!",
                color=discord.Color.orange()
            )
            
            if self.message:
                await self.message.edit(embed=embed, view=self)
        except asyncio.CancelledError:
            pass
    
    def create_embed(self, description: str, color: discord.Color) -> discord.Embed:
        """Criar embed do jogo"""
        embed = discord.Embed(
            title="🎮 Jogo do Galo",
            description=description,
            color=color
        )
        
        # Mostrar tabuleiro visual
        board_str = ""
        for row in self.board:
            row_display = []
            for cell in row:
                if cell == "X":
                    row_display.append("❌")
                elif cell == "O":
                    row_display.append("⭕")
                else:
                    row_display.append("⬜")
            board_str += " ".join(row_display) + "\n"
        
        embed.add_field(name="📊 Tabuleiro", value=board_str, inline=False)
        
        if not self.is_single_player:
            embed.add_field(name="👥 Jogadores", value=f"❌ {self.player1.mention}\n⭕ {self.player2.mention}", inline=False)
        else:
            embed.add_field(name="👥 Jogadores", value=f"❌ {self.player1.mention}\n⭕ **EPA BOT**", inline=False)
        
        embed.set_footer(text="EPA Bot • Jogo do Galo")
        return embed
    
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
    
    def disable_all_buttons(self):
        """Desabilitar todos os botões"""
        for button in self.children:
            if isinstance(button, TicTacToeButton):
                button.disabled = True
    
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
                item.label = "⭕"
                item.style = discord.ButtonStyle.danger
                item.disabled = True
                break
    
    async def on_timeout(self):
        """Executado quando o timeout é atingido"""
        self.cancel_turn_timer()
        for item in self.children:
            item.disabled = True


class Connect4Button(discord.ui.Button):
    """Botão para jogar 4 em linha"""
    
    def __init__(self, column: int):
        super().__init__(
            style=discord.ButtonStyle.primary, 
            label=f"{column + 1}",
            custom_id=f"c4_col_{column}"
        )
        self.column = column

    async def callback(self, interaction: discord.Interaction):
        """Callback executado quando o botão é clicado"""
        view: Connect4View = self.view
        
        # Verificar se é a vez do jogador
        if interaction.user != view.current_player_user:
            await interaction.response.send_message(
                "❌ Não é a tua vez!",
                ephemeral=True
            )
            return
        
        # Resetar timer
        view.reset_turn_timer()
        
        # Tentar colocar peça na coluna
        row = view.drop_piece(self.column)
        if row == -1:
            await interaction.response.send_message(
                "❌ Esta coluna está cheia!",
                ephemeral=True
            )
            return
        
        # Verificar vencedor
        winner = view.check_winner()
        if winner:
            view.cancel_turn_timer()
            for button in view.children:
                button.disabled = True
            
            winner_user = view.player1 if winner == "🔴" else view.player2
            embed = discord.Embed(
                title="🎉 Jogo Terminado!",
                description=f"**Vencedor:** {winner_user.mention if not winner_user.bot else 'EPA BOT'} ({winner})",
                color=discord.Color.green()
            )
            board_display = view.get_board_display()
            embed.add_field(name="Tabuleiro Final:", value=board_display, inline=False)
            embed.set_footer(text="EPA Bot • 4 em Linha")
            
            await interaction.response.defer()
            await interaction.message.edit(embed=embed, view=view)
            return
        
        # Verificar empate
        if view.is_full():
            for button in view.children:
                button.disabled = True
            
            embed = discord.Embed(
                title="🤝 Empate!",
                description="O tabuleiro está cheio! Ninguém ganhou!",
                color=discord.Color.orange()
            )
            board_display = view.get_board_display()
            embed.add_field(name="Tabuleiro Final:", value=board_display, inline=False)
            embed.set_footer(text="EPA Bot • 4 em Linha")
            
            await interaction.response.defer()
            await interaction.message.edit(embed=embed, view=view)
            return
        
        # Próximo jogador
        view.switch_player()
        
        # Se é modo single player e é a vez do bot
        if view.is_single_player and view.current_player_user.bot:
            await view.make_bot_move(interaction)
        else:
            embed = discord.Embed(
                title="🎯 4 em Linha",
                description=f"**Vez de:** {view.current_player_user.mention if not view.current_player_user.bot else 'EPA BOT'} ({view.current_symbol})",
                color=discord.Color.blue()
            )
            board_display = view.get_board_display()
            embed.add_field(name="Tabuleiro:", value=board_display, inline=False)
            embed.set_footer(text="EPA Bot • 4 em Linha")
            
            await interaction.response.defer()
            await interaction.message.edit(embed=embed, view=view)


class Connect4View(discord.ui.View):
    """View principal do 4 em linha"""
    
    def __init__(self, player1: discord.Member, player2: Optional[discord.Member] = None, channel = None):
        super().__init__(timeout=None)  # Sem timeout global, usamos timer manual
        
        self.player1 = player1
        self.player2 = player2  # None para modo single player (bot)
        self.board = [[" " for _ in range(7)] for _ in range(6)]  # 6 linhas x 7 colunas
        self.current_symbol = "🔴"
        self.current_player_user = player1
        self.is_single_player = player2 is None
        self.channel = channel
        self.turn_timer_task = None
        self.message = None
        
        # Se single player, usar bot
        if self.is_single_player:
            import types
            bot_user = types.SimpleNamespace()
            bot_user.mention = "EPA BOT"
            bot_user.bot = True
            self.player2 = bot_user
        
        # Adicionar botões de coluna (0-6)
        for col in range(7):
            self.add_item(Connect4Button(col))
    
    def drop_piece(self, column: int) -> int:
        """Coloca peça na coluna. Retorna linha onde caiu ou -1 se cheia"""
        for row in range(5, -1, -1):  # De baixo para cima
            if self.board[row][column] == " ":
                self.board[row][column] = self.current_symbol
                return row
        return -1
    
    def switch_player(self):
        """Alterna entre os jogadores"""
        if self.current_symbol == "🔴":
            self.current_symbol = "🟡"
            self.current_player_user = self.player2
        else:
            self.current_symbol = "🔴"
            self.current_player_user = self.player1
    
    def check_winner(self) -> Optional[str]:
        """Verifica se há um vencedor (4 em linha)"""
        # Verificar horizontal
        for row in range(6):
            for col in range(4):
                if (self.board[row][col] != " " and
                    self.board[row][col] == self.board[row][col+1] == 
                    self.board[row][col+2] == self.board[row][col+3]):
                    return self.board[row][col]
        
        # Verificar vertical
        for row in range(3):
            for col in range(7):
                if (self.board[row][col] != " " and
                    self.board[row][col] == self.board[row+1][col] == 
                    self.board[row+2][col] == self.board[row+3][col]):
                    return self.board[row][col]
        
        # Verificar diagonal descendente (\)
        for row in range(3):
            for col in range(4):
                if (self.board[row][col] != " " and
                    self.board[row][col] == self.board[row+1][col+1] == 
                    self.board[row+2][col+2] == self.board[row+3][col+3]):
                    return self.board[row][col]
        
        # Verificar diagonal ascendente (/)
        for row in range(3, 6):
            for col in range(4):
                if (self.board[row][col] != " " and
                    self.board[row][col] == self.board[row-1][col+1] == 
                    self.board[row-2][col+2] == self.board[row-3][col+3]):
                    return self.board[row][col]
        
        return None
    
    def is_full(self) -> bool:
        """Verifica se o tabuleiro está cheio"""
        return all(self.board[0][col] != " " for col in range(7))
    
    def get_board_display(self) -> str:
        """Retorna representação visual do tabuleiro"""
        display = ""
        for row in self.board:
            display += "".join([cell if cell != " " else "⚫" for cell in row]) + "\n"
        display += "1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣"
        return display
    
    def start_turn_timer(self):
        """Iniciar timer de 45 segundos para a jogada"""
        if self.turn_timer_task:
            self.turn_timer_task.cancel()
        
        if not self.is_single_player and self.current_player_user and not hasattr(self.current_player_user, 'bot'):
            self.turn_timer_task = asyncio.create_task(self._turn_timeout())
    
    def reset_turn_timer(self):
        """Resetar timer da jogada"""
        if self.turn_timer_task:
            self.turn_timer_task.cancel()
        self.start_turn_timer()
    
    def cancel_turn_timer(self):
        """Cancelar timer da jogada"""
        if self.turn_timer_task:
            self.turn_timer_task.cancel()
            self.turn_timer_task = None
    
    async def _turn_timeout(self):
        """Timeout de 45 segundos - jogador atual perde"""
        try:
            await asyncio.sleep(45)
            
            # Jogador atual perdeu por timeout
            winner = self.player2 if self.current_player_user == self.player1 else self.player1
            
            for item in self.children:
                item.disabled = True
            
            embed = discord.Embed(
                title="⏰ Tempo Esgotado!",
                description=f"{self.current_player_user.mention} demorou mais de 45 segundos!\n\n🎉 **{winner.mention}** vence por desistência!",
                color=discord.Color.orange()
            )
            
            if self.message:
                await self.message.edit(embed=embed, view=self)
        except asyncio.CancelledError:
            pass
    
    async def make_bot_move(self, interaction: discord.Interaction):
        """Faz a jogada do bot (modo single player)"""
        if not self.is_single_player or not self.current_player_user.bot:
            return
        
        # Estratégia do bot: tentar ganhar > bloquear > centro > aleatório
        
        # 1. Tentar ganhar
        for col in range(7):
            row = self._try_column(col, "🟡")
            if row != -1:
                self.board[row][col] = " "  # Desfazer
                winner = self.check_winner()
                if winner == "🟡":
                    self.drop_piece(col)
                    await self._handle_bot_move_result(interaction)
                    return
                self.board[row][col] = " "
        
        # 2. Bloquear jogador
        for col in range(7):
            row = self._try_column(col, "🔴")
            if row != -1:
                self.board[row][col] = " "  # Desfazer
                winner = self.check_winner()
                if winner == "🔴":
                    self.drop_piece(col)
                    await self._handle_bot_move_result(interaction)
                    return
                self.board[row][col] = " "
        
        # 3. Preferir centro
        center_columns = [3, 2, 4, 1, 5, 0, 6]
        for col in center_columns:
            if self._can_drop(col):
                self.drop_piece(col)
                await self._handle_bot_move_result(interaction)
                return
    
    def _can_drop(self, column: int) -> bool:
        """Verifica se pode colocar peça na coluna"""
        return self.board[0][column] == " "
    
    def _try_column(self, column: int, symbol: str) -> int:
        """Tenta colocar símbolo na coluna e retorna linha"""
        for row in range(5, -1, -1):
            if self.board[row][column] == " ":
                self.board[row][column] = symbol
                return row
        return -1
    
    async def _handle_bot_move_result(self, interaction: discord.Interaction):
        """Processa resultado após jogada do bot"""
        # Verificar vencedor
        winner = self.check_winner()
        if winner:
            for button in self.children:
                button.disabled = True
            
            embed = discord.Embed(
                title="🎉 Jogo Terminado!",
                description=f"**Vencedor:** EPA BOT (🟡)",
                color=discord.Color.red()
            )
            board_display = self.get_board_display()
            embed.add_field(name="Tabuleiro Final:", value=board_display, inline=False)
            embed.set_footer(text="EPA Bot • 4 em Linha")
            
            await interaction.message.edit(embed=embed, view=self)
            await interaction.response.defer()
            return
        
        # Verificar empate
        if self.is_full():
            for button in self.children:
                button.disabled = True
            
            embed = discord.Embed(
                title="🤝 Empate!",
                description="O tabuleiro está cheio! Ninguém ganhou!",
                color=discord.Color.orange()
            )
            board_display = self.get_board_display()
            embed.add_field(name="Tabuleiro Final:", value=board_display, inline=False)
            embed.set_footer(text="EPA Bot • 4 em Linha")
            
            await interaction.response.defer()
            await interaction.message.edit(embed=embed, view=self)
            return
        
        # Voltar para o jogador humano
        self.switch_player()
        
        embed = discord.Embed(
            title="🎯 4 em Linha",
            description=f"**Vez de:** {self.current_player_user.mention} ({self.current_symbol})",
            color=discord.Color.blue()
        )
        board_display = self.get_board_display()
        embed.add_field(name="Tabuleiro:", value=board_display, inline=False)
        embed.set_footer(text="EPA Bot • 4 em Linha")
        
        await interaction.response.defer()
        await interaction.message.edit(embed=embed, view=self)
    
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
            return await interaction.response.send_message("❌ Não podes jogar contra ti próprio!", ephemeral=True)
        
        if oponente and oponente.bot:
            return await interaction.response.send_message("❌ Não podes jogar contra outros bots!", ephemeral=True)
        
        # Modo vs Bot - iniciar diretamente
        if oponente is None:
            view = TicTacToeView(interaction.user, None, interaction.channel)
            description = f"Vez de {interaction.user.mention} (❌)"
            embed = view.create_embed(description, discord.Color.blue())
            
            msg = await interaction.response.send_message(embed=embed, view=view)
            view.message = await interaction.original_response()
            view.start_turn_timer()
            return
        
        # Modo PvP - enviar desafio
        challenge_embed = discord.Embed(
            title="🎮 Desafio de Jogo do Galo!",
            description=f"{interaction.user.mention} desafiou {oponente.mention} para um jogo do galo!\n\n{oponente.mention}, aceitas o desafio?",
            color=discord.Color.blue()
        )
        challenge_embed.set_footer(text="⏰ Tens 60 segundos para aceitar o desafio")
        
        challenge_view = ChallengeView(interaction.user, oponente)
        await interaction.response.send_message(embed=challenge_embed, view=challenge_view)
        
        # Aguardar resposta
        await challenge_view.wait()
        
        if challenge_view.accepted is None:
            # Timeout
            timeout_embed = discord.Embed(
                title="⏰ Tempo Esgotado",
                description=f"{oponente.mention} não respondeu a tempo. O desafio expirou.",
                color=discord.Color.orange()
            )
            await interaction.edit_original_response(embed=timeout_embed, view=challenge_view)
        elif challenge_view.accepted:
            # Aceite - iniciar jogo
            view = TicTacToeView(interaction.user, oponente, interaction.channel)
            description = f"Vez de {interaction.user.mention} (❌)"
            embed = view.create_embed(description, discord.Color.blue())
            
            msg = await interaction.channel.send(embed=embed, view=view)
            view.message = msg
            view.start_turn_timer()

    @discord.app_commands.command(name="4emlinha", description="Jogo do 4 em linha (Connect Four)")
    @discord.app_commands.describe(oponente="Utilizador para jogar contra (opcional, deixe em branco para jogar contra o bot)")
    async def connect_four(self, interaction: discord.Interaction, oponente: Optional[discord.Member] = None):
        """
        Inicia um jogo de 4 em linha
        
        Args:
            oponente: Utilizador para jogar contra (opcional, deixe em branco para jogar contra o bot)
        """
        
        if oponente == interaction.user:
            return await interaction.response.send_message("❌ Não podes jogar contra ti próprio!", ephemeral=True)
        
        if oponente and oponente.bot:
            return await interaction.response.send_message("❌ Não podes jogar contra outros bots!", ephemeral=True)
        
        # Modo vs Bot - iniciar diretamente
        if oponente is None:
            import types
            bot_user = types.SimpleNamespace()
            bot_user.mention = "EPA BOT"
            bot_user.bot = True
            
            view = Connect4View(interaction.user, bot_user, interaction.channel)
            embed = discord.Embed(
                title="🎯 4 em Linha - Vs Bot",
                description=f"**Jogador:** {interaction.user.mention} (🔴)\n**Bot:** EPA BOT (🟡)\n\n**Vez de:** {interaction.user.mention}",
                color=discord.Color.blue()
            )
            board_display = view.get_board_display()
            embed.add_field(name="Tabuleiro:", value=board_display, inline=False)
            embed.set_footer(text="EPA Bot • 4 em Linha")
            
            msg = await interaction.response.send_message(embed=embed, view=view)
            view.message = await interaction.original_response()
            view.start_turn_timer()
            return
        
        # Modo PvP - enviar desafio
        challenge_embed = discord.Embed(
            title="🎯 Desafio de 4 em Linha!",
            description=f"{interaction.user.mention} desafiou {oponente.mention} para um jogo de 4 em linha!\n\n{oponente.mention}, aceitas o desafio?",
            color=discord.Color.blue()
        )
        challenge_embed.set_footer(text="⏰ Tens 60 segundos para aceitar o desafio")
        
        challenge_view = ChallengeView(interaction.user, oponente)
        await interaction.response.send_message(embed=challenge_embed, view=challenge_view)
        
        # Aguardar resposta
        await challenge_view.wait()
        
        if challenge_view.accepted is None:
            # Timeout
            timeout_embed = discord.Embed(
                title="⏰ Tempo Esgotado",
                description=f"{oponente.mention} não respondeu a tempo. O desafio expirou.",
                color=discord.Color.orange()
            )
            await interaction.edit_original_response(embed=timeout_embed, view=challenge_view)
        elif challenge_view.accepted:
            # Aceite - iniciar jogo
            view = Connect4View(interaction.user, oponente, interaction.channel)
            embed = discord.Embed(
                title="🎯 4 em Linha - Multiplayer",
                description=f"**Jogador 1:** {interaction.user.mention} (🔴)\n**Jogador 2:** {oponente.mention} (🟡)\n\n**Vez de:** {interaction.user.mention}",
                color=discord.Color.blue()
            )
            board_display = view.get_board_display()
            embed.add_field(name="Tabuleiro:", value=board_display, inline=False)
            embed.set_footer(text="EPA Bot • 4 em Linha • 45s por jogada")
            
            msg = await interaction.channel.send(embed=embed, view=view)
            view.message = msg
            view.start_turn_timer()

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

    @discord.app_commands.command(name="gamestats", description="Ver estatísticas dos teus jogos")
    @discord.app_commands.describe(
        jogo="Jogo específico (opcional)",
        utilizador="Ver stats de outro utilizador (opcional)"
    )
    @discord.app_commands.choices(jogo=[
        app_commands.Choice(name="Jogo do Galo", value="tictactoe"),
        app_commands.Choice(name="4 em Linha", value="connect4"),
        app_commands.Choice(name="Forca", value="hangman"),
        app_commands.Choice(name="Blackjack", value="blackjack")
    ])
    async def game_stats(
        self, 
        interaction: discord.Interaction, 
        jogo: Optional[str] = None,
        utilizador: Optional[discord.Member] = None
    ):
        """Ver estatísticas de jogos"""
        target_user = utilizador or interaction.user
        
        try:
            db = self.bot.db
            stats = await db.get_game_stats(str(target_user.id), jogo)
            
            if not stats:
                await interaction.response.send_message(
                    f"❌ {target_user.mention} ainda não jogou nenhum jogo!",
                    ephemeral=True
                )
                return
            
            embed = discord.Embed(
                title=f"📊 Estatísticas de Jogos - {target_user.display_name}",
                color=discord.Color.blue()
            )
            embed.set_thumbnail(url=target_user.display_avatar.url)
            
            if jogo:
                # Stats de um jogo específico
                game_names = {
                    "tictactoe": "🎮 Jogo do Galo",
                    "connect4": "🎯 4 em Linha",
                    "hangman": "🎪 Forca",
                    "blackjack": "🃏 Blackjack"
                }
                
                embed.add_field(
                    name=game_names.get(jogo, jogo.title()),
                    value=f"**Vitórias:** {stats.get('wins', 0)}\n"
                          f"**Derrotas:** {stats.get('losses', 0)}\n"
                          f"**Empates:** {stats.get('draws', 0)}\n"
                          f"**Total:** {stats.get('total_games', 0)} jogos\n"
                          f"**Ganhos:** {stats.get('total_earnings', 0)} EPA Coins\n"
                          f"**Melhor Streak:** {stats.get('best_streak', 0)}\n"
                          f"**Streak Atual:** {stats.get('current_streak', 0)}",
                    inline=False
                )
                
                # Calcular win rate
                total = stats.get('total_games', 0)
                if total > 0:
                    win_rate = (stats.get('wins', 0) / total) * 100
                    embed.add_field(
                        name="📈 Win Rate",
                        value=f"{win_rate:.1f}%",
                        inline=True
                    )
            else:
                # Stats de todos os jogos
                game_names = {
                    "tictactoe": "🎮 Jogo do Galo",
                    "connect4": "🎯 4 em Linha",
                    "hangman": "🎪 Forca",
                    "blackjack": "🃏 Blackjack"
                }
                
                total_wins = 0
                total_games = 0
                total_earnings = 0
                
                for game_type, game_stats in stats.items():
                    total_wins += game_stats.get('wins', 0)
                    total_games += game_stats.get('total_games', 0)
                    total_earnings += game_stats.get('total_earnings', 0)
                    
                    embed.add_field(
                        name=game_names.get(game_type, game_type.title()),
                        value=f"V: {game_stats.get('wins', 0)} | "
                              f"D: {game_stats.get('losses', 0)} | "
                              f"E: {game_stats.get('draws', 0)}",
                        inline=True
                    )
                
                embed.add_field(
                    name="🏆 Totais",
                    value=f"**Vitórias:** {total_wins}\n"
                          f"**Jogos:** {total_games}\n"
                          f"**Ganhos:** {total_earnings} EPA Coins",
                    inline=False
                )
            
            await interaction.response.send_message(embed=embed)
            
        except Exception as e:
            await interaction.response.send_message(
                f"❌ Erro ao obter estatísticas: {e}",
                ephemeral=True
            )

    @discord.app_commands.command(name="gameleaderboard", description="Ver leaderboard de jogos")
    @discord.app_commands.describe(jogo="Tipo de jogo")
    @discord.app_commands.choices(jogo=[
        app_commands.Choice(name="Jogo do Galo", value="tictactoe"),
        app_commands.Choice(name="4 em Linha", value="connect4"),
        app_commands.Choice(name="Forca", value="hangman"),
        app_commands.Choice(name="Blackjack", value="blackjack")
    ])
    async def game_leaderboard(self, interaction: discord.Interaction, jogo: str):
        """Ver leaderboard de um jogo"""
        game_names = {
            "tictactoe": "🎮 Jogo do Galo",
            "connect4": "🎯 4 em Linha",
            "hangman": "🎪 Forca",
            "blackjack": "🃏 Blackjack"
        }
        
        try:
            db = self.bot.db
            leaderboard = await db.get_game_leaderboard(jogo, limit=10)
            
            if not leaderboard:
                await interaction.response.send_message(
                    f"❌ Ainda não há estatísticas para {game_names.get(jogo, jogo)}!",
                    ephemeral=True
                )
                return
            
            embed = discord.Embed(
                title=f"🏆 Leaderboard - {game_names.get(jogo, jogo.title())}",
                color=discord.Color.gold()
            )
            
            description = ""
            medals = ["🥇", "🥈", "🥉"]
            
            for i, entry in enumerate(leaderboard, 1):
                try:
                    user = await self.bot.fetch_user(int(entry['user_id']))
                    user_name = user.display_name
                except:
                    user_name = f"User#{entry['user_id'][-4:]}"
                
                medal = medals[i-1] if i <= 3 else f"`#{i}`"
                wins = entry['wins']
                games = entry['total_games']
                earnings = entry['total_earnings']
                streak = entry['best_streak']
                
                win_rate = (wins / games * 100) if games > 0 else 0
                
                description += f"{medal} **{user_name}**\n"
                description += f"   Vitórias: {wins} | WR: {win_rate:.1f}% | Streak: {streak}\n\n"
            
            embed.description = description
            embed.set_footer(text=f"Dados do servidor • Top 10")
            
            await interaction.response.send_message(embed=embed)
            
        except Exception as e:
            await interaction.response.send_message(
                f"❌ Erro ao obter leaderboard: {e}",
                ephemeral=True
            )



async def setup(bot):
    """Função para carregar o cog"""
    await bot.add_cog(GamesCog(bot))
