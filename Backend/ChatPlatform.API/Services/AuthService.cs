using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using ChatPlatform.API.Configuration;
using ChatPlatform.API.Data;
using ChatPlatform.API.DTOs;
using ChatPlatform.API.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace ChatPlatform.API.Services;

public interface IAuthService
{
    Task<TokenResponse> RegisterAsync(RegisterRequest request, string? ip, CancellationToken ct);
    Task<TokenResponse> LocalAsync(string? ip, CancellationToken ct);
    Task<TokenResponse> LoginAsync(LoginRequest request, string? ip, CancellationToken ct);
    Task<TokenResponse> RefreshAsync(RefreshRequest request, string? ip, CancellationToken ct);
    Task LogoutAsync(Guid userId, string refreshToken, CancellationToken ct);
    Task<UserDto> GetCurrentUserAsync(Guid userId, CancellationToken ct);
    Task<UserDto> UpdateProfileAsync(Guid userId, UpdateProfileRequest request, CancellationToken ct);
    Task ChangePasswordAsync(Guid userId, ChangePasswordRequest request, CancellationToken ct);
    Task DeleteAccountAsync(Guid userId, CancellationToken ct);
}

public class AuthService(AppDbContext db, IOptions<JwtOptions> jwtOptions)
    : IAuthService
{
    private readonly JwtOptions _jwt = jwtOptions.Value;

    public async Task<TokenResponse> RegisterAsync(RegisterRequest request, string? ip, CancellationToken ct)
    {
        var normalized = request.Email.Trim().ToUpperInvariant();
        if (await db.Users.AnyAsync(x => x.NormalizedEmail == normalized, ct))
            throw new AppException("EmailAlreadyRegistered", "An account with this email already exists.", 409);

        var (hash, salt) = HashPassword(request.Password);
        var user = new ApplicationUser
        {
            Email = request.Email.Trim(),
            NormalizedEmail = normalized,
            DisplayName = request.DisplayName.Trim(),
            PasswordHash = hash,
            PasswordSalt = salt,
        };
        db.Users.Add(user);
        await db.UserSettings.AddAsync(new UserSettings { UserId = user.Id }, ct);
        await db.SaveChangesAsync(ct);

        return await IssueTokensAsync(user, ip, ct);
    }

    /// <summary>
    /// Single-user local mode: creates one local account on first use and issues a token.
    /// No credentials are ever shown or required. Random password is generated and discarded.
    /// </summary>
    public async Task<TokenResponse> LocalAsync(string? ip, CancellationToken ct)
    {
        const string normalized = "LOCAL@HFR.LOCAL";
        var user = await db.Users.SingleOrDefaultAsync(x => x.NormalizedEmail == normalized, ct);
        if (user is null)
        {
            var (hash, salt) = HashPassword(Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)));
            user = new ApplicationUser
            {
                Email = "local@HFR.local",
                NormalizedEmail = normalized,
                DisplayName = "Mostafawr",
                PasswordHash = hash,
                PasswordSalt = salt,
            };
            db.Users.Add(user);
            db.UserSettings.Add(new UserSettings { UserId = user.Id });
            await db.SaveChangesAsync(ct);
        }
        if (!user.IsActive)
            throw new AppException("AccountInactive", "The local account is inactive.", 403);
        return await IssueTokensAsync(user, ip, ct);
    }

    public async Task<TokenResponse> LoginAsync(LoginRequest request, string? ip, CancellationToken ct)
    {
        var normalized = request.Email.Trim().ToUpperInvariant();
        var user = await db.Users.SingleOrDefaultAsync(x => x.NormalizedEmail == normalized, ct);
        if (user is null || !user.IsActive || !VerifyPassword(request.Password, user.PasswordHash, user.PasswordSalt))
            throw new AppException("InvalidCredentials", "Invalid email or password.", 401);

        return await IssueTokensAsync(user, ip, ct);
    }

    public async Task<TokenResponse> RefreshAsync(RefreshRequest request, string? ip, CancellationToken ct)
    {
        var tokenHash = Sha256(request.RefreshToken);
        var existing = await db.RefreshTokens
            .Include(x => x.User)
            .SingleOrDefaultAsync(x => x.TokenHash == tokenHash, ct);

        if (existing is null || existing.RevokedAt is not null || existing.ExpiresAt <= DateTimeOffset.UtcNow)
            throw new AppException("InvalidRefreshToken", "The refresh token is invalid or expired.", 401);
        if (!existing.User.IsActive)
            throw new AppException("InvalidRefreshToken", "The account is inactive.", 401);

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        existing.RevokedAt = DateTimeOffset.UtcNow;
        var response = await IssueTokensAsync(existing.User, ip, ct);
        existing.ReplacedByTokenId = (await db.RefreshTokens
            .SingleAsync(x => x.TokenHash == Sha256(response.RefreshToken), ct)).Id;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return response;
    }

    public async Task LogoutAsync(Guid userId, string refreshToken, CancellationToken ct)
    {
        var tokenHash = Sha256(refreshToken);
        var token = await db.RefreshTokens
            .SingleOrDefaultAsync(x => x.UserId == userId && x.TokenHash == tokenHash, ct);
        if (token is null) return;
        token.RevokedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    public async Task<UserDto> GetCurrentUserAsync(Guid userId, CancellationToken ct)
    {
        var user = await db.Users.FindAsync([userId], ct)
            ?? throw new AppException("UserNotFound", "User not found.", 404);
        return new UserDto(user.Id, user.Email, user.DisplayName);
    }

    public async Task<UserDto> UpdateProfileAsync(Guid userId, UpdateProfileRequest request, CancellationToken ct)
    {
        var user = await db.Users.FindAsync([userId], ct)
            ?? throw new AppException("UserNotFound", "User not found.", 404);
        user.DisplayName = request.DisplayName.Trim();
        if (!string.IsNullOrWhiteSpace(request.Email))
        {
            var normalized = request.Email.Trim().ToUpperInvariant();
            if (await db.Users.AnyAsync(x => x.NormalizedEmail == normalized && x.Id != userId, ct))
                throw new AppException("EmailAlreadyRegistered", "An account with this email already exists.", 409);
            user.Email = request.Email.Trim();
            user.NormalizedEmail = normalized;
        }
        user.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return new UserDto(user.Id, user.Email, user.DisplayName);
    }

    public async Task ChangePasswordAsync(Guid userId, ChangePasswordRequest request, CancellationToken ct)
    {
        var user = await db.Users.FindAsync([userId], ct)
            ?? throw new AppException("UserNotFound", "User not found.", 404);
        if (!VerifyPassword(request.CurrentPassword, user.PasswordHash, user.PasswordSalt))
            throw new AppException("InvalidCredentials", "Current password is incorrect.", 400);

        var (hash, salt) = HashPassword(request.NewPassword);
        user.PasswordHash = hash;
        user.PasswordSalt = salt;
        user.UpdatedAt = DateTimeOffset.UtcNow;
        foreach (var token in await db.RefreshTokens.Where(x => x.UserId == userId && x.RevokedAt == null).ToListAsync(ct))
            token.RevokedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    public async Task DeleteAccountAsync(Guid userId, CancellationToken ct)
    {
        var user = await db.Users.FindAsync([userId], ct)
            ?? throw new AppException("UserNotFound", "User not found.", 404);
        db.Users.Remove(user);
        await db.SaveChangesAsync(ct);
    }

    private async Task<TokenResponse> IssueTokensAsync(ApplicationUser user, string? ip, CancellationToken ct)
    {
        var expires = DateTimeOffset.UtcNow.AddMinutes(_jwt.AccessTokenMinutes);
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
        };
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwt.Key));
        var token = new JwtSecurityToken(
            issuer: _jwt.Issuer,
            audience: _jwt.Audience,
            claims: claims,
            notBefore: DateTime.UtcNow,
            expires: expires.UtcDateTime,
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));

        var rawRefresh = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64))
            .Replace('+', '-').Replace('/', '_').TrimEnd('=');
        db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            TokenHash = Sha256(rawRefresh),
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(_jwt.RefreshTokenDays),
            CreatedByIp = ip is null ? null : Truncate(ip, 64),
        });
        await db.SaveChangesAsync(ct);

        return new TokenResponse(
            new JwtSecurityTokenHandler().WriteToken(token),
            rawRefresh,
            expires,
            new UserDto(user.Id, user.Email, user.DisplayName));
    }

    private static (byte[] Hash, byte[] Salt) HashPassword(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, 100_000, HashAlgorithmName.SHA256, 32);
        return (hash, salt);
    }

    private static bool VerifyPassword(string password, byte[] hash, byte[] salt)
    {
        var attempt = Rfc2898DeriveBytes.Pbkdf2(password, salt, 100_000, HashAlgorithmName.SHA256, 32);
        return CryptographicOperations.FixedTimeEquals(attempt, hash);
    }

    private static string Sha256(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    private static string Truncate(string value, int max) => value.Length <= max ? value : value[..max];
}

public class AppException(string code, string message, int status) : Exception(message)
{
    public string Code { get; } = code;
    public int Status { get; } = status;
}
