"""
Sistema de Paginação para EPA BOT
Permite navegação entre páginas de conteúdo usando botões
"""

import discord
from discord import ui
from typing import List, Optional, Callable
import asyncio


class PaginationView(ui.View):
    """View para paginação com botões"""
    
    def __init__(
        self,
        embeds: List[discord.Embed],
        author_id: int,
        timeout: int = 180
    ):
        super().__init__(timeout=timeout)
        self.embeds = embeds
        self.author_id = author_id
        self.current_page = 0
        self.total_pages = len(embeds)
        
        # Atualizar estado dos botões
        self._update_buttons()
    
    def _update_buttons(self):
        """Atualiza o estado dos botões baseado na página atual"""
        self.first_page.disabled = self.current_page == 0
        self.prev_page.disabled = self.current_page == 0
        self.next_page.disabled = self.current_page == self.total_pages - 1
        self.last_page.disabled = self.current_page == self.total_pages - 1
        
        # Atualizar label do contador
        self.page_counter.label = f"{self.current_page + 1}/{self.total_pages}"
    
    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        """Verifica se quem clicou foi quem invocou o comando"""
        if interaction.user.id != self.author_id:
            await interaction.response.send_message(
                "❌ Apenas quem executou o comando pode usar estes botões!",
                ephemeral=True
            )
            return False
        return True
    
    @ui.button(emoji="⏮️", style=discord.ButtonStyle.secondary)
    async def first_page(self, interaction: discord.Interaction, button: ui.Button):
        """Vai para a primeira página"""
        self.current_page = 0
        self._update_buttons()
        await interaction.response.edit_message(embed=self.embeds[self.current_page], view=self)
    
    @ui.button(emoji="◀️", style=discord.ButtonStyle.primary)
    async def prev_page(self, interaction: discord.Interaction, button: ui.Button):
        """Vai para a página anterior"""
        self.current_page -= 1
        self._update_buttons()
        await interaction.response.edit_message(embed=self.embeds[self.current_page], view=self)
    
    @ui.button(label="1/1", style=discord.ButtonStyle.secondary, disabled=True)
    async def page_counter(self, interaction: discord.Interaction, button: ui.Button):
        """Mostra a página atual (não clicável)"""
        pass
    
    @ui.button(emoji="▶️", style=discord.ButtonStyle.primary)
    async def next_page(self, interaction: discord.Interaction, button: ui.Button):
        """Vai para a próxima página"""
        self.current_page += 1
        self._update_buttons()
        await interaction.response.edit_message(embed=self.embeds[self.current_page], view=self)
    
    @ui.button(emoji="⏭️", style=discord.ButtonStyle.secondary)
    async def last_page(self, interaction: discord.Interaction, button: ui.Button):
        """Vai para a última página"""
        self.current_page = self.total_pages - 1
        self._update_buttons()
        await interaction.response.edit_message(embed=self.embeds[self.current_page], view=self)
    
    @ui.button(emoji="🗑️", style=discord.ButtonStyle.danger)
    async def delete_message(self, interaction: discord.Interaction, button: ui.Button):
        """Apaga a mensagem"""
        await interaction.message.delete()
        self.stop()
    
    async def on_timeout(self):
        """Desativa os botões quando o timeout expira"""
        for item in self.children:
            item.disabled = True


class SimplePaginationView(ui.View):
    """View de paginação simplificada (apenas próximo/anterior)"""
    
    def __init__(
        self,
        embeds: List[discord.Embed],
        author_id: int,
        timeout: int = 180
    ):
        super().__init__(timeout=timeout)
        self.embeds = embeds
        self.author_id = author_id
        self.current_page = 0
        self.total_pages = len(embeds)
        
        # Se só há uma página, remover botões
        if self.total_pages <= 1:
            self.clear_items()
        else:
            self._update_buttons()
    
    def _update_buttons(self):
        """Atualiza o estado dos botões"""
        self.prev_button.disabled = self.current_page == 0
        self.next_button.disabled = self.current_page == self.total_pages - 1
        self.page_label.label = f"Página {self.current_page + 1}/{self.total_pages}"
    
    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        """Verifica se quem clicou foi quem invocou o comando"""
        if interaction.user.id != self.author_id:
            await interaction.response.send_message(
                "❌ Apenas quem executou o comando pode usar estes botões!",
                ephemeral=True
            )
            return False
        return True
    
    @ui.button(label="◀️ Anterior", style=discord.ButtonStyle.primary)
    async def prev_button(self, interaction: discord.Interaction, button: ui.Button):
        """Página anterior"""
        self.current_page -= 1
        self._update_buttons()
        await interaction.response.edit_message(embed=self.embeds[self.current_page], view=self)
    
    @ui.button(label="Página 1/1", style=discord.ButtonStyle.secondary, disabled=True)
    async def page_label(self, interaction: discord.Interaction, button: ui.Button):
        """Label da página (não clicável)"""
        pass
    
    @ui.button(label="Próxima ▶️", style=discord.ButtonStyle.primary)
    async def next_button(self, interaction: discord.Interaction, button: ui.Button):
        """Próxima página"""
        self.current_page += 1
        self._update_buttons()
        await interaction.response.edit_message(embed=self.embeds[self.current_page], view=self)
    
    async def on_timeout(self):
        """Desativa os botões quando o timeout expira"""
        for item in self.children:
            item.disabled = True


class PaginatorHelper:
    """Helper para criar paginadores facilmente"""
    
    @staticmethod
    def paginate_list(
        items: List[str],
        items_per_page: int = 10,
        title: str = "Lista",
        color: int = 0x5865F2
    ) -> List[discord.Embed]:
        """
        Cria uma lista de embeds paginados a partir de uma lista de strings
        
        Args:
            items: Lista de strings para paginar
            items_per_page: Número de items por página
            title: Título do embed
            color: Cor do embed
        
        Returns:
            Lista de embeds
        """
        if not items:
            embed = discord.Embed(
                title=title,
                description="Nenhum item encontrado.",
                color=color
            )
            return [embed]
        
        embeds = []
        total_pages = (len(items) + items_per_page - 1) // items_per_page
        
        for page in range(total_pages):
            start = page * items_per_page
            end = start + items_per_page
            page_items = items[start:end]
            
            embed = discord.Embed(
                title=title,
                description="\n".join(page_items),
                color=color
            )
            embed.set_footer(text=f"Página {page + 1}/{total_pages} • Total: {len(items)} items")
            embeds.append(embed)
        
        return embeds
    
    @staticmethod
    def paginate_fields(
        fields: List[dict],
        fields_per_page: int = 10,
        title: str = "Informação",
        description: str = None,
        color: int = 0x5865F2
    ) -> List[discord.Embed]:
        """
        Cria uma lista de embeds paginados a partir de uma lista de fields
        
        Args:
            fields: Lista de dicionários com 'name' e 'value'
            fields_per_page: Número de fields por página
            title: Título do embed
            description: Descrição do embed
            color: Cor do embed
        
        Returns:
            Lista de embeds
        """
        if not fields:
            embed = discord.Embed(
                title=title,
                description=description or "Nenhuma informação disponível.",
                color=color
            )
            return [embed]
        
        embeds = []
        total_pages = (len(fields) + fields_per_page - 1) // fields_per_page
        
        for page in range(total_pages):
            start = page * fields_per_page
            end = start + fields_per_page
            page_fields = fields[start:end]
            
            embed = discord.Embed(
                title=title,
                description=description,
                color=color
            )
            
            for field in page_fields:
                embed.add_field(
                    name=field.get('name', 'Campo'),
                    value=field.get('value', 'Sem valor'),
                    inline=field.get('inline', True)
                )
            
            embed.set_footer(text=f"Página {page + 1}/{total_pages}")
            embeds.append(embed)
        
        return embeds
    
    @staticmethod
    async def send_paginated(
        interaction: discord.Interaction,
        embeds: List[discord.Embed],
        ephemeral: bool = False,
        simple: bool = False
    ):
        """
        Envia uma mensagem paginada
        
        Args:
            interaction: Interação do Discord
            embeds: Lista de embeds
            ephemeral: Se a mensagem deve ser efêmera
            simple: Usar paginação simplificada
        """
        if len(embeds) == 1:
            await interaction.response.send_message(embed=embeds[0], ephemeral=ephemeral)
        else:
            view_class = SimplePaginationView if simple else PaginationView
            view = view_class(embeds, interaction.user.id)
            await interaction.response.send_message(embed=embeds[0], view=view, ephemeral=ephemeral)
