using ChatPlatform.API.Services.AI;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChatPlatform.API.Controllers;

[ApiController]
[Authorize]
[Route("api/models")]
public class ModelsController(IAiModelResolver resolver, IOllamaModelSync sync) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);

    /// <summary>Refreshes the locally installed Ollama models, then returns them.</summary>
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        // Browser refreshes abort HttpContext.RequestAborted; model listing must
        // still complete so the client does not receive a 500 on a simple refresh.
        await sync.SyncAsync(CancellationToken.None);
        return Ok(await resolver.ListAsync(UserId, CancellationToken.None));
    }
}
