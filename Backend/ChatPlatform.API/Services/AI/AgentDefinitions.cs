namespace ChatPlatform.API.Services.AI;

/// <summary>
/// Static instructions for the built-in conversational agents shown in the UI.
/// These are prompt-level behaviours only — no extra tools are implied.
/// </summary>
public static class AgentDefinitions
{
    public static readonly IReadOnlyDictionary<string, string> Instructions =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["general"] = "You are the General Assistant. Answer the user's question directly and clearly using the available context.",
            ["search"] = "You are the Search Agent. Analyse the supplied information carefully, separate facts from assumptions, and state explicitly when live web search or search tools are not available. Never invent sources or results.",
            ["coding"] = "You are the Coding Agent. Produce correct, readable code with brief explanations. Review code for bugs, edge cases and security issues. State assumptions when requirements are unclear.",
            ["orchestrator"] = "You are the Orchestrator Agent. Break the request into clear steps, assign each step to an appropriate capability (general, search or coding), explain the order of work, and then give a concise consolidated answer. Do not claim that other agents actually executed tasks.",
        };

    public static string? Get(string? key) =>
        !string.IsNullOrWhiteSpace(key) && Instructions.TryGetValue(key, out var value) ? value : null;
}
