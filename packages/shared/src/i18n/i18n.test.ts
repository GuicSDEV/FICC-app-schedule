import { describe, expect, it } from "vitest";
import { z } from "zod";

import { idSchema } from "../schemas/common";
import { translate, translateIssue, translateRef } from "./index";

describe("translate", () => {
  it("resolves keys and fills placeholders", () => {
    expect(translate("api.bookingNotFound")).toBe("Reserva não encontrada.");
    expect(translate("api.playerBusy", { name: "Ana" })).toBe(
      "Ana já tem uma reserva nesse horário.",
    );
    expect(translateRef({ key: "api.beyondBookingWindow", params: { days: 14 } })).toBe(
      "Reservas abrem com até 14 dias de antecedência.",
    );
  });

  it("falls back to pt-BR for unknown locales and to the key for unknown keys", () => {
    expect(translate("api.notFound", {}, "xx-XX")).toBe("Não encontrado.");
    expect(translate("api.doesNotExist")).toBe("api.doesNotExist");
    expect(translate("api.playerBusy")).toBe("{name} já tem uma reserva nesse horário.");
  });

  it("gives checks without a message a generic translated key", () => {
    const tooLong = z.string().max(3).safeParse("abcd");
    expect(translateIssue(tooLong.error!.issues[0]!)).toBe("Máximo de 3 caracteres");
    const missing = z.object({ id: idSchema }).safeParse({});
    expect(translateIssue(missing.error!.issues[0]!)).toBe("Obrigatório");
    const option = z.enum(["A", "B"]).safeParse("C");
    expect(translateIssue(option.error!.issues[0]!)).toBe("Opção inválida");
  });
});
