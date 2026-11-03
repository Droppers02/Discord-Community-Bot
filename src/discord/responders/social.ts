import { createResponder } from "#base";
import { ResponderType } from "@constatic/base";
import { MessageFlags } from "discord.js";
import { COLORS, parseColorString } from "../../lib/branding.js";
import { buildContainer, errorContainer, successContainer } from "../../lib/containers.js";
import { CV2_FLAG } from "../../lib/discord.js";
import { t } from "../../lib/i18n.js";
import { acceptFriend, getFriendship, marriageOf, marry, removeFriend, saveProfile } from "../../repositories/socialRepository.js";

// /editarperfil (modal)
createResponder({
    customId: "profile/edit",
    types: [ResponderType.Modal],
    async run(interaction) {
        if (!interaction.inCachedGuild()) return;
        const value = (id: string) => interaction.fields.getTextInputValue(id).trim() || null;
        const color = value("color");
        if (color && parseColorString(color) === null) return void interaction.reply({ components: [errorContainer(t("Cor inválida — usa por exemplo `#7C5CFF`."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        const birthday = value("birthday");
        const match = birthday?.match(/^(\d{1,2})\/(\d{1,2})$/);
        if (birthday && (!match || Number(match[1]) < 1 || Number(match[1]) > 31 || Number(match[2]) < 1 || Number(match[2]) > 12)) {
            return void interaction.reply({ components: [errorContainer(t("Aniversário no formato DD/MM (ex.: 25/12)."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        }
        await saveProfile(interaction.guildId, interaction.user.id, {
            bio: value("bio"),
            color,
            birthday: match ? `${match[1]!.padStart(2, "0")}/${match[2]!.padStart(2, "0")}` : null,
            favorite_game: value("game"),
        });
        await interaction.reply({ components: [successContainer(t("Perfil atualizado. Vê-o com `/perfil`."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
    },
});

// Pedidos de amizade: friend/<accept|decline>/<quem pediu>/<quem recebe>
createResponder({
    customId: "friend/:action/:from/:to",
    types: [ResponderType.Button],
    async run(interaction, { action, from, to }) {
        if (!interaction.inCachedGuild()) return;
        if (interaction.user.id !== to) return void interaction.reply({ components: [errorContainer(t("Este pedido não é para ti."))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        const existing = await getFriendship(interaction.guildId, from, to);
        if (!existing || existing.status !== "pending") return void interaction.update({ components: [buildContainer({ color: COLORS.neutral, description: t("Este pedido já não está pendente.") })] });
        if (action === "accept") {
            await acceptFriend(interaction.guildId, from, to);
            return void interaction.update({ components: [buildContainer({ color: COLORS.success, description: `🤝 ${t("{a} e {b} agora são amigos!", { a: `<@${from}>`, b: `<@${to}>` })}` })], allowedMentions: { parse: [] } });
        }
        await removeFriend(interaction.guildId, from, to);
        await interaction.update({ components: [buildContainer({ color: COLORS.neutral, description: t("Pedido de amizade recusado.") })] });
    },
});

// Pedidos de casamento: marry/<accept|decline>/<quem pediu>/<quem recebe>
createResponder({
    customId: "marry/:action/:from/:to",
    types: [ResponderType.Button],
    async run(interaction, { action, from, to }) {
        if (!interaction.inCachedGuild()) return;
        if (interaction.user.id !== to) return void interaction.reply({ components: [errorContainer(t("Este pedido não é para ti. 😏"))], flags: CV2_FLAG | MessageFlags.Ephemeral });
        if (action === "decline") return void interaction.update({ components: [buildContainer({ color: COLORS.neutral, description: `💔 ${t("{to} recusou o pedido de {from}.", { to: `<@${to}>`, from: `<@${from}>` })}` })], allowedMentions: { parse: [] } });
        if (await marriageOf(interaction.guildId, from) || await marriageOf(interaction.guildId, to)) {
            return void interaction.update({ components: [buildContainer({ color: COLORS.neutral, description: t("Um de vocês já casou entretanto. 👀") })] });
        }
        await marry(interaction.guildId, from, to);
        await interaction.update({
            components: [buildContainer({ color: COLORS.danger, title: `💒 ${t("Vivam os noivos!")}`, description: t("{a} e {b} acabaram de casar! 🎉💍", { a: `<@${from}>`, b: `<@${to}>` }) })],
            allowedMentions: { users: [from, to] },
        });
    },
});
