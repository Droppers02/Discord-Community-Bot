import discord
from discord.ext import commands

class HelpPagination(discord.ui.View):
    """View for help pagination"""
    
    def __init__(self, embeds, timeout=180):
        super().__init__(timeout=timeout)
        self.embeds = embeds
        self.current_page = 0
        self.max_pages = len(embeds)
        self.update_buttons()
    
    def update_buttons(self):
        """Update button states"""
        self.first_page.disabled = self.current_page == 0
        self.prev_page.disabled = self.current_page == 0
        self.next_page.disabled = self.current_page == self.max_pages - 1
        self.last_page.disabled = self.current_page == self.max_pages - 1
    
    @discord.ui.button(label="⏮️", style=discord.ButtonStyle.secondary, custom_id="first")
    async def first_page(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_page = 0
        self.update_buttons()
        await interaction.response.edit_message(embed=self.embeds[self.current_page], view=self)
    
    @discord.ui.button(label="◀️", style=discord.ButtonStyle.primary, custom_id="prev")
    async def prev_page(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_page -= 1
        self.update_buttons()
        await interaction.response.edit_message(embed=self.embeds[self.current_page], view=self)
    
    @discord.ui.button(label="▶️", style=discord.ButtonStyle.primary, custom_id="next")
    async def next_page(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_page += 1
        self.update_buttons()
        await interaction.response.edit_message(embed=self.embeds[self.current_page], view=self)
    
    @discord.ui.button(label="⏭️", style=discord.ButtonStyle.secondary, custom_id="last")
    async def last_page(self, interaction: discord.Interaction, button: discord.ui.Button):
        self.current_page = self.max_pages - 1
        self.update_buttons()
        await interaction.response.edit_message(embed=self.embeds[self.current_page], view=self)
    
    async def on_timeout(self):
        """Disable buttons after timeout"""
        for item in self.children:
            item.disabled = True

class HelpCog(commands.Cog):
    """Cog for the help command"""
    
    def __init__(self, bot):
        self.bot = bot

    @discord.app_commands.command(name="help", description="Shows all available commands")
    async def help_command(self, interaction: discord.Interaction):
        """Help command with pagination"""
        
        await interaction.response.defer()
        
        embeds = []
        
        # ===== PAGE 1: Introduction & Games =====
        embed1 = discord.Embed(
            title="🤖 EPA Bot - Games & Fun",
            description="Use the buttons below to navigate between categories.\n"
                       "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
            color=0x5865F2
        )
        if self.bot.user.avatar:
            embed1.set_thumbnail(url=self.bot.user.avatar.url)
        
        game_commands = [
            "• `/tictactoe [opponent]` - Tic-Tac-Toe",
            "• `/connect4 [opponent]` - Connect 4",
            "• `/quiz` - Quiz questions",
            "• `/hangman` - Hangman game",
            "• `/blackjack <bet>` - Blackjack"
        ]
        embed1.add_field(name="🎮 **Main Games**", value="\n".join(game_commands), inline=False)
        
        game_mini = [
            "• `/reaction` - Quick reaction",
            "• `/math` - Math challenge",
            "• `/memory` - Memory game"
        ]
        embed1.add_field(name="⚡ **Mini-Games**", value="\n".join(game_mini), inline=False)
        
        game_stats = [
            "• `/gamestats [game] [user]` - View stats",
            "• `/gameleaderboard <game>` - Top 10"
        ]
        embed1.add_field(name="📊 **Statistics**", value="\n".join(game_stats), inline=False)
        
        fun_commands = [
            "• `/test` - Test bot",
            "• `/dice <sides>` - Roll dice",
            "• `/ship <user1> <user2>` - Compatibility"
        ]
        embed1.add_field(name="🎉 **Fun**", value="\n".join(fun_commands), inline=False)
        
        embed1.set_footer(text="Page 1/5 • Use buttons to navigate")
        embeds.append(embed1)
        
        # ===== PAGE 2: Economy =====
        embed2 = discord.Embed(
            title="🤖 EPA Bot - Economy",
            color=0x5865F2
        )
        if self.bot.user.avatar:
            embed2.set_thumbnail(url=self.bot.user.avatar.url)
        
        economy_commands = [
            "• `/balance [@user]` - View balance",
            "• `/daily` - Daily reward (streak bonus)",
            "• `/work` - Work (1h cooldown)",
            "• `/crime` - Risky crime (2h cooldown)",
            "• `/shop` - Item shop",
            "• `/buy <item>` - Buy item",
            "• `/inventory [@user]` - View inventory",
            "• `/give <user> <amount>` - Give coins",
            "• `/leaderboard` - Top users",
            "• `/profile [@user]` - Economic profile"
        ]
        embed2.add_field(name="💰 **Basic Economy**", value="\n".join(economy_commands), inline=False)
        
        economy_advanced = [
            "• `/buy_role <name> <color>` - Custom Role (50k)",
            "• `/edit_role [name] [color]` - Edit role",
            "• `/remove_role` - Remove role",
            "• `/propose_trade <@user> <coins> <request>` - Trade",
            "• `/pending_trades` - View trades",
            "• `/achievements [@user]` - View achievements",
            "• `/create_auction <item> <desc> <bid>` - Auction",
            "• `/auctions` - View active auctions",
            "• `/bid <id> <amount>` - Place bid"
        ]
        embed2.add_field(name="💎 **Advanced Economy**", value="\n".join(economy_advanced), inline=False)
        
        events_commands = [
            "• `/create_event <type> <hours>` - [ADMIN]",
            "• `/active_events` - View events"
        ]
        embed2.add_field(name="🎊 **Special Events**", value="\n".join(events_commands), inline=False)
        
        social_commands = [
            "• `/rank [user]` - View level, XP and progress",
            "• `/like <user>` - Give reputation (1h cooldown)",
            "• `/leaderboard [type]` - Rankings (XP/Reputation)",
            "• `/profile [user]` - View complete profile",
            "• `/editprofile` - Customize profile",
            "• `/badges [user]` - View earned badges",
            "• `/marry <user>` - Propose marriage",
            "• `/divorce` - Get divorced",
            "• `/history [user]` - View activities",
            "• `/streaks` - View streaks (Daily/Messages/Games)"
        ]
        embed2.add_field(name="⭐ **Advanced Social**", value="\n".join(social_commands), inline=False)
        
        embed2.set_footer(text="Page 2/5 • Use buttons to navigate")
        embeds.append(embed2)
        
        # ===== PAGE 3: Music & Utilities =====
        embed3 = discord.Embed(
            title="🤖 EPA Bot - Music & Utilities",
            color=0x5865F2
        )
        if self.bot.user.avatar:
            embed3.set_thumbnail(url=self.bot.user.avatar.url)
        
        music_commands = [
            "• `/play <song>` - Play music",
            "• `/pause` - Pause",
            "• `/resume` - Resume",
            "• `/skip` - Next song",
            "• `/stop` - Stop and clear queue",
            "• `/queue` - View queue",
            "• `/nowplaying` - Current song"
        ]
        embed3.add_field(name="🎵 **Music**", value="\n".join(music_commands), inline=False)
        
        utility_commands = [
            "• `/avatar [user]` - View avatar",
            "• `/emoji <emoji>` - Enlarge custom emoji",
            "• `/emojiinfo <emoji>` - Emoji technical info",
            "• `/userinfo [user]` - User info",
            "• `/serverinfo` - Server info",
            "• `/botinfo` - Bot info",
            "• `/reminder` - Create reminder",
            "• `/poll` - Create poll",
            "• `/announcement` - [ADMIN] Schedule announcement"
        ]
        embed3.add_field(name="🔧 **Utilities**", value="\n".join(utility_commands), inline=False)
        
        embed3.set_footer(text="Page 3/5 • Use buttons to navigate")
        embeds.append(embed3)
        
        # ===== PAGE 4: Moderation =====
        embed4 = discord.Embed(
            title="🤖 EPA Bot - Moderation",
            color=0x5865F2
        )
        if self.bot.user.avatar:
            embed4.set_thumbnail(url=self.bot.user.avatar.url)
        
        moderation_commands = [
            "• `/kick <user> [reason]` - Kick",
            "• `/ban <user> [reason]` - Ban",
            "• `/unban <user_id>` - Unban",
            "• `/timeout <user> <preset>` - Timeout",
            "• `/untimeout <user>` - Remove timeout",
            "• `/warn <user> <reason>` - Warn",
            "• `/warnings <user>` - View warnings",
            "• `/clear <amount>` - Clear messages"
        ]
        embed4.add_field(name="🛡️ **Basic Moderation**", value="\n".join(moderation_commands), inline=False)
        
        moderation_advanced = [
            "• `/setup_modlogs <channel>` - Moderation logs",
            "• `/setup_wordfilter` - Word filter",
            "• `/setup_quarantine` - Quarantine system",
            "• `/setup_appeals` - Appeals system"
        ]
        embed4.add_field(name="🔧 **Advanced Moderation**", value="\n".join(moderation_advanced), inline=False)
        
        embed4.set_footer(text="Page 4/5 • Use buttons to navigate")
        embeds.append(embed4)
        
        # ===== PAGE 5: Tickets & Admin =====
        embed5 = discord.Embed(
            title="🤖 EPA Bot - Tickets & Admin",
            color=0x5865F2
        )
        if self.bot.user.avatar:
            embed5.set_thumbnail(url=self.bot.user.avatar.url)
        
        tickets_commands = [
            "• `/setup_tickets` - [ADMIN] Configure panel",
            "• `/rename <name>` - [STAFF] Rename ticket"
        ]
        embed5.add_field(name="🎫 **Tickets**", value="\n".join(tickets_commands), inline=False)
        
        admin_commands = [
            "• `/setup_autoroles` - Configure auto-roles",
            "• `/setup_verification` - 2FA system",
            "• `/reload <cog>` - Reload module",
            "• `/sync` - Sync commands",
            "• `/status` - Bot status",
            "• `/ping` - Latency"
        ]
        embed5.add_field(name="👑 **Admin**", value="\n".join(admin_commands), inline=False)
        
        info = [
            "🔹 **Games:** 9 games with stats and leaderboards",
            "🔹 **Economy:** Complete coin system",
            "🔹 **Social:** Levels, XP and reputation",
            "🔹 **Tickets:** 5 categories available",
            "🔹 **Author:** Droppers 🇵🇹"
        ]
        embed5.add_field(name="ℹ️ **Info**", value="\n".join(info), inline=False)
        
        total_commands = len([cmd for cmd in self.bot.tree.get_commands()])
        embed5.set_footer(
            text=f"Page 5/5 • {total_commands} Commands • {len(self.bot.guilds)} Server(s)",
            icon_url=self.bot.user.avatar.url if self.bot.user.avatar else None
        )
        embeds.append(embed5)
        
        # Create pagination view and send
        view = HelpPagination(embeds)
        await interaction.followup.send(embed=embeds[0], view=view)


async def setup(bot):
    """Function to load the cog"""
    await bot.add_cog(HelpCog(bot))
