import { describe, expect, it } from "vitest";
import { DEFAULT_RPG_PREFERENCES, resolveRpgPreferences } from "./useRpgPreferences";

describe("preferências do modo RPG", () => {
  it("sem usuário devolve os padrões", () => {
    expect(resolveRpgPreferences(null)).toEqual(DEFAULT_RPG_PREFERENCES);
  });

  it("servidor tem prioridade sobre o legado do navegador", () => {
    const prefs = resolveRpgPreferences({ rpg_prefs: { showXp: false }, rpg_avatar_image: null }, { showXp: true, sound: true });
    expect(prefs.showXp).toBe(false);
    expect(prefs.sound).toBe(true);
  });

  it("sanitiza banner/personagem desconhecidos e avatar customizado sem imagem", () => {
    const prefs = resolveRpgPreferences(
      { rpg_prefs: { banner: "nao-existe", avatarId: "dragao", avatarMode: "custom" } as never, rpg_avatar_image: null },
    );
    expect(prefs.banner).toBe(DEFAULT_RPG_PREFERENCES.banner);
    expect(prefs.avatarId).toBe(DEFAULT_RPG_PREFERENCES.avatarId);
    expect(prefs.avatarMode).toBe("rpg");

    const withImage = resolveRpgPreferences({ rpg_prefs: { avatarMode: "custom" }, rpg_avatar_image: "data:image/png;base64,AAA" });
    expect(withImage.avatarMode).toBe("custom");
  });
});
