using System.Text;
using System.Text.Json;
using ChatPlatform.API.DTOs;
using ChatPlatform.API.Services;
using ChatPlatform.API.Services.AI;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChatPlatform.API.Controllers;

[ApiController]
[Authorize]
[Route("api/chats")]
public class ChatsController(IChatService chats, AiOrchestrator stream) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);

    [HttpGet]
    [ProducesResponseType(typeof(PagedResult<ChatDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> List([FromQuery] string? search, [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50, [FromQuery] string? sort = null, CancellationToken ct = default) =>
        Ok(await chats.ListAsync(UserId, search, page, pageSize, sort, ct));

    [HttpPost]
    [ProducesResponseType(typeof(ChatDto), StatusCodes.Status201Created)]
    public async Task<IActionResult> Create([FromBody] CreateChatRequest request, CancellationToken ct)
    {
        var created = await chats.CreateAsync(UserId, request, ct);
        return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
    }

    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(ChatDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var chat = await chats.GetAsync(UserId, id, ct);
        return chat is null ? NotFound(new ErrorResponse("ChatNotFound", "Chat not found.")) : Ok(chat);
    }

    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> Rename(Guid id, [FromBody] RenameChatRequest request, CancellationToken ct) =>
        Ok(await chats.RenameAsync(UserId, id, request.Title, ct));

    [HttpPatch("{id:guid}/model")]
    public async Task<IActionResult> SetModel(Guid id, [FromBody] SetChatModelRequest request, CancellationToken ct) =>
        Ok(await chats.SetModelAsync(UserId, id, request.ModelId, ct));

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        await chats.DeleteAsync(UserId, id, ct);
        return NoContent();
    }

    [HttpGet("{id:guid}/messages")]
    [ProducesResponseType(typeof(List<MessageDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> Messages(Guid id, [FromQuery] int page = 1,
        [FromQuery] int pageSize = 100, CancellationToken ct = default) =>
        Ok(await chats.GetMessagesAsync(UserId, id, page, pageSize, ct));

    [HttpPost("{id:guid}/messages")]
    [ProducesResponseType(typeof(MessageDto), StatusCodes.Status201Created)]
    public async Task<IActionResult> Send(Guid id, [FromBody] SendMessageRequest request, CancellationToken ct)
    {
        var message = await chats.AddUserMessageAsync(UserId, id, request, ct);
        return CreatedAtAction(nameof(Get), new { id }, message);
    }

    /// <summary>
    /// Persists the user message, streams the assistant response as Server-Sent Events,
    /// then persists the assistant message. Cancellation stops generation immediately.
    /// </summary>
    [HttpPost("{id:guid}/stream")]
    [Produces("text/event-stream")]
    public async Task Stream(Guid id, [FromBody] SendMessageRequest request, CancellationToken ct)
    {
        Response.ContentType = "text/event-stream";
        Response.Headers.CacheControl = "no-cache, no-transform";
        Response.Headers["X-Accel-Buffering"] = "no";

        var requestId = string.IsNullOrWhiteSpace(request.RequestId)
            ? Guid.NewGuid().ToString("N")
            : request.RequestId;

        try
        {
            var userMessage = await chats.AddUserMessageAsync(UserId, id, request with { RequestId = requestId }, ct);
            await WriteEvent("user", new { userMessage.Id, userMessage.Content }, ct);

            var context = await chats.BuildContextAsync(UserId, id, request.AttachmentIds, request.AgentKey, ct);
            var accumulated = new StringBuilder();
            await foreach (var token in stream.StreamAsync(UserId, request.AIModelId ?? context.ModelId, context,
                               request.DeepResearch, ct).WithCancellation(ct))
            {
                accumulated.Append(token);
                await WriteEvent("token", new { text = token }, ct);
            }

            var assistant = await chats.PersistAssistantAsync(UserId, id, accumulated.ToString(),
                requestId + ":assistant", false, ct);
            await WriteEvent("done", new { assistant.Id, content = accumulated.ToString() }, ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // Client disconnected or stopped generation; nothing further is written.
        }
        catch (AppException ex)
        {
            await WriteEvent("error", new { code = ex.Code, message = ex.Message }, CancellationToken.None);
        }
        catch (Exception)
        {
            await WriteEvent("error", new { code = "GenerationFailed", message = "AI generation failed." }, CancellationToken.None);
        }
    }

    private async Task WriteEvent(string eventName, object payload, CancellationToken ct)
    {
        var json = JsonSerializer.Serialize(payload);
        await Response.WriteAsync($"event: {eventName}\ndata: {json}\n\n", Encoding.UTF8, ct);
        await Response.Body.FlushAsync(ct);
    }
}

