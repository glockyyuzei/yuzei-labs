use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisResult {
    pub summary: String,
    pub root_cause: String,
    pub suggested_fixes: Vec<String>,
    pub confidence: u8,
    pub related_files: Vec<String>,
    pub error_type: String,
    pub used_ai: bool,
    pub source: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAnalysisRequest {
    pub input: String,
    pub provider: String,
    pub api_key: String,
    pub model: Option<String>,
    pub base_url: Option<String>,
}

static KNOWLEDGE_BASE: &[(&str, &str, &str, &[&str])] = &[
    (
        "NullPointerException",
        "java.lang.NullPointerException",
        "A null object was accessed where a non-null value was required.",
        &[
            "Add null checks before accessing the object",
            "Initialize the object in the constructor or @PostConstruct/init method",
            "Use Optional<T> for nullable return values",
            "Check if dependency injection is configured correctly",
        ],
    ),
    (
        "ClassNotFoundException",
        "java.lang.ClassNotFoundException",
        "The JVM could not find a required class at runtime.",
        &[
            "Verify the dependency is included in build.gradle",
            "Check if the class was relocated/shaded incorrectly",
            "Ensure the JAR is in the classpath or mods/plugins folder",
            "Run `./gradlew build --refresh-dependencies`",
        ],
    ),
    (
        "NoClassDefFoundError",
        "java.lang.NoClassDefFoundError",
        "A class was present at compile time but missing at runtime.",
        &[
            "Add the missing dependency to runtime classpath",
            "Check for version conflicts between dependencies",
            "Verify shadow/shade plugin configuration",
            "Ensure all mod/plugin dependencies are installed on the server",
        ],
    ),
    (
        "GradleBuildFailed",
        "BUILD FAILED",
        "The Gradle build process encountered an error.",
        &[
            "Read the first 'Caused by:' line in the stack trace",
            "Run `./gradlew build --stacktrace` for detailed output",
            "Check Java version compatibility with Gradle",
            "Verify repository URLs are accessible",
        ],
    ),
    (
        "MixinApplyError",
        "Mixin apply failed",
        "A Fabric/Forge mixin failed to apply to the target class.",
        &[
            "Verify the target method exists in the mapped Minecraft version",
            "Check @Inject/@Redirect target signatures match",
            "Update mappings to match your Minecraft version",
            "Check for mixin conflicts with other mods",
        ],
    ),
    (
        "ModLoadingError",
        "Mod Loading Exception",
        "A Forge/NeoForge mod failed to load during startup.",
        &[
            "Check mods.toml / neoforge.mods.toml for correct metadata",
            "Verify mod dependencies are installed",
            "Check for version mismatch with Minecraft/Loader",
            "Review the 'Mod loading error' section in latest.log",
        ],
    ),
    (
        "PaperPluginError",
        "Could not load plugin",
        "A Paper/Bukkit/Spigot plugin failed to load.",
        &[
            "Verify plugin.yml is present and valid",
            "Check API version compatibility with server",
            "Ensure all plugin dependencies are installed",
            "Check for softdepend/harddepend requirements",
        ],
    ),
    (
        "OutOfMemoryError",
        "java.lang.OutOfMemoryError",
        "The JVM ran out of available memory.",
        &[
            "Increase -Xmx flag in startup script",
            "Check for memory leaks in your code",
            "Reduce view distance or entity count on server",
            "Profile heap usage with VisualVM or JProfiler",
        ],
    ),
];

fn extract_exception_type(input: &str) -> Option<String> {
    let re = Regex::new(r"(?m)([\w$.]+Exception|[\w$.]+Error):\s").ok()?;
    re.captures(input)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
}

fn extract_related_files(input: &str) -> Vec<String> {
    let re = Regex::new(r"(?m)(?:at\s+[\w.$]+\()?([\w/\\]+(?:\.java|\.kt))(?::\d+)?").ok();
    let mut files = Vec::new();
    if let Some(re) = re {
        for cap in re.captures_iter(input) {
            if let Some(m) = cap.get(1) {
                let file = m.as_str().replace('\\', "/");
                if !files.contains(&file) {
                    files.push(file);
                }
            }
        }
    }
    files.truncate(10);
    files
}

fn detect_error_type(input: &str) -> String {
    let lower = input.to_lowercase();
    if lower.contains("fabric") || lower.contains("mixin") {
        return "Fabric Mod Error".into();
    }
    if lower.contains("neoforge") || lower.contains("net.neoforged") {
        return "NeoForge Mod Error".into();
    }
    if lower.contains("forge") || lower.contains("minecraftforge") {
        return "Forge Mod Error".into();
    }
    if lower.contains("paper") || lower.contains("bukkit") || lower.contains("spigot") {
        return "Plugin Error".into();
    }
    if lower.contains("velocity") {
        return "Velocity Plugin Error".into();
    }
    if lower.contains("gradle") || lower.contains("build failed") {
        return "Gradle Error".into();
    }
    if extract_exception_type(input).is_some() {
        return "Java Exception".into();
    }
    "General Error".into()
}

fn analyze_local(input: &str) -> Option<AnalysisResult> {
    for (name, pattern, root_cause, fixes) in KNOWLEDGE_BASE {
        if input.contains(pattern) {
            let exception = extract_exception_type(input).unwrap_or_else(|| name.to_string());
            return Some(AnalysisResult {
                summary: format!(
                    "Detected {exception} — a common issue in Java/Minecraft development."
                ),
                root_cause: root_cause.to_string(),
                suggested_fixes: fixes.iter().map(|s| s.to_string()).collect(),
                confidence: 92,
                related_files: extract_related_files(input),
                error_type: detect_error_type(input),
                used_ai: false,
                source: "Local Knowledge Base".into(),
            });
        }
    }
    None
}

#[tauri::command]
pub fn analyze_offline(input: String) -> Result<AnalysisResult, String> {
    if input.trim().is_empty() {
        return Err("No input provided".into());
    }

    if let Some(result) = analyze_local(&input) {
        return Ok(result);
    }

    let error_type = detect_error_type(&input);
    let exception = extract_exception_type(&input).unwrap_or_else(|| "Unknown Error".into());

    Ok(AnalysisResult {
        summary: format!("Detected {exception}. No exact match in local knowledge base."),
        root_cause:
            "This error requires deeper analysis. Consider using AI analysis for detailed insights."
                .into(),
        suggested_fixes: vec![
            "Review the full stack trace from bottom to top".into(),
            "Check the first 'Caused by:' section".into(),
            "Search for the exception type in project source".into(),
            "Use AI analysis for detailed fix suggestions".into(),
        ],
        confidence: 45,
        related_files: extract_related_files(&input),
        error_type,
        used_ai: false,
        source: "Heuristic Analysis".into(),
    })
}

#[tauri::command]
pub async fn analyze_with_ai(req: AiAnalysisRequest) -> Result<AnalysisResult, String> {
    if req.input.trim().is_empty() {
        return Err("No input provided".into());
    }

    if let Some(local) = analyze_local(&req.input) {
        if local.confidence >= 90 {
            return Ok(local);
        }
    }

    let (url, model) = resolve_provider(&req)?;

    let system_prompt = "You are an expert Java and Minecraft mod/plugin developer assistant. Analyze the error and respond ONLY with valid JSON in this exact format: {\"summary\":\"...\",\"rootCause\":\"...\",\"suggestedFixes\":[\"...\"],\"confidence\":85,\"relatedFiles\":[\"...\"]}";

    let body = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": format!("Analyze this error:\n\n{}", req.input) }
        ],
        "temperature": 0.3
    });

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", req.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("AI request failed: {e}"))?;

    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!("AI provider error ({status}): {text}"));
    }

    parse_ai_response(&text, &req.input)
}

fn resolve_provider(req: &AiAnalysisRequest) -> Result<(String, String), String> {
    let model = req
        .model
        .clone()
        .unwrap_or_else(|| match req.provider.as_str() {
            "openai" => "gpt-4o-mini".into(),
            "anthropic" => "claude-3-5-haiku-20241022".into(),
            "gemini" => "google/gemini-2.0-flash-001".into(),
            "openrouter" => "anthropic/claude-3.5-sonnet".into(),
            "ollama" => "llama3.2".into(),
            "lmstudio" => "local-model".into(),
            // OmniRoute has its own auto-routing across whatever providers are
            // connected in its dashboard — "auto" lets it pick, same idea as
            // OpenRouter's :auto suffix but built into OmniRoute itself.
            "omniroute" => "auto".into(),
            _ => "gpt-4o-mini".into(),
        });

    if req.provider == "custom" && req.base_url.is_none() {
        return Err("Custom provider requires baseUrl".into());
    }

    let url = req
        .base_url
        .clone()
        .unwrap_or_else(|| match req.provider.as_str() {
            "openai" => "https://api.openai.com/v1/chat/completions".into(),
            "openrouter" => "https://openrouter.ai/api/v1/chat/completions".into(),
            "gemini" => "https://openrouter.ai/api/v1/chat/completions".into(),
            "anthropic" => "https://openrouter.ai/api/v1/chat/completions".into(),
            "ollama" => "http://localhost:11434/v1/chat/completions".into(),
            "lmstudio" => "http://localhost:1234/v1/chat/completions".into(),
            // Default port per OmniRoute's own docs; user's dashboard may be
            // configured on a different port via PORT env var, in which case
            // they'd override this with a custom baseUrl anyway.
            "omniroute" => "http://localhost:20128/v1/chat/completions".into(),
            _ => "https://openrouter.ai/api/v1/chat/completions".into(),
        });

    Ok((url, model))
}

fn parse_ai_response(response_text: &str, input: &str) -> Result<AnalysisResult, String> {
    let json: serde_json::Value = serde_json::from_str(response_text)
        .map_err(|e| format!("Invalid AI response JSON: {e}"))?;

    let content = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("");

    let parsed: serde_json::Value = if content.starts_with('{') {
        serde_json::from_str(content).unwrap_or(serde_json::json!({}))
    } else {
        let re = Regex::new(r"```(?:json)?\s*([\s\S]*?)```").ok();
        if let Some(re) = re {
            if let Some(cap) = re.captures(content) {
                serde_json::from_str(cap.get(1).unwrap().as_str()).unwrap_or(serde_json::json!({}))
            } else {
                serde_json::json!({})
            }
        } else {
            serde_json::json!({})
        }
    };

    Ok(AnalysisResult {
        summary: parsed["summary"]
            .as_str()
            .unwrap_or("Analysis completed")
            .to_string(),
        root_cause: parsed["rootCause"]
            .as_str()
            .or(parsed["root_cause"].as_str())
            .unwrap_or("See suggested fixes")
            .to_string(),
        suggested_fixes: parsed["suggestedFixes"]
            .as_array()
            .or(parsed["suggested_fixes"].as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default(),
        confidence: parsed["confidence"].as_u64().unwrap_or(75) as u8,
        related_files: parsed["relatedFiles"]
            .as_array()
            .or(parsed["related_files"].as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_else(|| extract_related_files(input)),
        error_type: detect_error_type(input),
        used_ai: true,
        source: "AI Analysis".into(),
    })
}

#[tauri::command]
pub async fn ai_chat(
    messages: Vec<HashMap<String, String>>,
    provider: String,
    api_key: String,
    model: Option<String>,
    base_url: Option<String>,
) -> Result<String, String> {
    let req = AiAnalysisRequest {
        input: String::new(),
        provider,
        api_key,
        model,
        base_url,
    };
    let (url, model_name) = resolve_provider(&req)?;

    let chat_messages: Vec<serde_json::Value> = messages
        .iter()
        .map(|m| {
            serde_json::json!({
                "role": m.get("role").unwrap_or(&"user".into()),
                "content": m.get("content").unwrap_or(&String::new())
            })
        })
        .collect();

    let body = serde_json::json!({
        "model": model_name,
        "messages": chat_messages,
        "temperature": 0.5
    });

    let response = reqwest::Client::new()
        .post(&url)
        .header("Authorization", format!("Bearer {}", req.api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = serde_json::from_str(&response).map_err(|e| e.to_string())?;
    Ok(json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("No response")
        .to_string())
}

#[tauri::command]
pub fn read_file_content(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}
