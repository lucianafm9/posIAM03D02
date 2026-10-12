/** Dados que o assistente nunca deve receber, repetir nem guardar na memória. */
export const SENSITIVE_PATTERNS: ReadonlyArray<{ label: string; re: RegExp }> = [
  { label: "CPF", re: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/ },
  { label: "número de cartão", re: /\b(?:\d{4}[ .-]?){3}\d{4}\b/ },
  // Só o VALOR de uma senha ("minha senha é X", "senha: X"); falar de senha (ex.: redefinir) é legítimo.
  { label: "senha", re: /\bsenha\b[^.?!\n]{0,30}?(?:\sé\s|:|=)\s*\S{4,}/i },
  { label: "chave de API/token", re: /\b(?:sk-[A-Za-z0-9_-]{10,}|api[_ -]?key|token de acesso)\b/i },
];

export function findSensitiveData(text: string): string[] {
  return SENSITIVE_PATTERNS.filter(({ re }) => re.test(text)).map(({ label }) => label);
}
