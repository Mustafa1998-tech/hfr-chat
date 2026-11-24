using ChatPlatform.API.DTOs;
using ChatPlatform.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChatPlatform.API.Controllers;

[ApiController]
[Authorize]
[Route("api/users")]
public class UsersController(IAuthService auth) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);

    [HttpGet("me")]
    [ProducesResponseType(typeof(UserDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> Me(CancellationToken ct) => Ok(await auth.GetCurrentUserAsync(UserId, ct));

    [HttpPatch("me")]
    [ProducesResponseType(typeof(UserDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> Update([FromBody] UpdateProfileRequest request, CancellationToken ct) =>
        Ok(await auth.UpdateProfileAsync(UserId, request, ct));

    [HttpDelete("me")]
    public async Task<IActionResult> DeleteMe(CancellationToken ct)
    {
        await auth.DeleteAccountAsync(UserId, ct);
        return NoContent();
    }

    [HttpPost("me/password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request, CancellationToken ct)
    {
        await auth.ChangePasswordAsync(UserId, request, ct);
        return NoContent();
    }
}

