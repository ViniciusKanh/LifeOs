//! Sessão do usuário guardada no cofre de credenciais do sistema operacional
//! (Gerenciador de Credenciais do Windows). O token é o mesmo JWT de sessão
//! da Web, emitido pela API; nenhum segredo da aplicação (Turso, Gemini, SMTP)
//! existe no cliente.

use keyring::{Entry, Error as KeyringError};

const SERVICE: &str = "LifeOS Desktop";
const ACCOUNT: &str = "session";
/// JWT de sessão do LifeOS tem poucas centenas de bytes; o limite evita abuso.
const MAX_TOKEN_LEN: usize = 2048;

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|e| format!("cofre indisponível: {e}"))
}

/// Aceita apenas o formato de um JWT (base64url separado por pontos).
fn is_valid_token(token: &str) -> bool {
    !token.is_empty()
        && token.len() <= MAX_TOKEN_LEN
        && token.split('.').count() == 3
        && token.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

#[tauri::command]
pub fn session_token_get() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(token) if is_valid_token(&token) => Ok(Some(token)),
        Ok(_) | Err(KeyringError::NoEntry) => Ok(None),
        Err(e) => Err(format!("não foi possível ler a sessão: {e}")),
    }
}

#[tauri::command]
pub fn session_token_set(token: String) -> Result<(), String> {
    if !is_valid_token(&token) {
        return Err("token de sessão inválido".into());
    }
    entry()?.set_password(&token).map_err(|e| format!("não foi possível salvar a sessão: {e}"))
}

#[tauri::command]
pub fn session_token_clear() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(e) => Err(format!("não foi possível encerrar a sessão: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::is_valid_token;

    #[test]
    fn valida_formato_jwt() {
        assert!(is_valid_token("aaa.bbb-_.ccc"));
        assert!(!is_valid_token(""));
        assert!(!is_valid_token("sem-pontos"));
        assert!(!is_valid_token("a.b.c\n"));
        assert!(!is_valid_token(&format!("a.b.{}", "c".repeat(3000))));
    }
}
