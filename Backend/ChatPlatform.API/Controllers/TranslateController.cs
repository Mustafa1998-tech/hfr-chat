using ChatPlatform.API.DTOs;
using ChatPlatform.API.Services.AI;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChatPlatform.API.Controllers;

[ApiController]
[Authorize]
[Route("api/translate")]
public class TranslateController(IOllamaTranslator translator, IAiModelResolver resolver) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);

    /// <summary>Translates text between English and Arabic using the selected Ollama model.</summary>
    [HttpPost]
    public async Task<IActionResult> Translate([FromBody] TranslateRequest request, CancellationToken ct)
    {
        if (request.From is not ("en" or "ar" or "auto") || request.To is not ("en" or "ar"))
            return BadRequest(new ErrorResponse("InvalidLanguage", "From must be en/ar/auto and to must be en/ar."));
        if (request.From != "auto" && request.From == request.To)
            return BadRequest(new ErrorResponse("InvalidLanguage", "Source and target languages must differ."));

        var model = await resolver.ResolveAsync(UserId, null, ct);
        if (!model.Configured)
            return StatusCode(503, new ErrorResponse("ProviderNotConfigured", "No Ollama model is available for translation."));

        var translation = await translator.TranslateAsync(request.Text, request.From, request.To,
            model.ProviderModelId, ct);
        return Ok(new TranslateResponse(translation, request.From, request.To));
    }
}
