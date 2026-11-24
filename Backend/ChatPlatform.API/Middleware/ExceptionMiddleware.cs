using System.Net;
using System.Text.Json;
using ChatPlatform.API.Services;
using ChatPlatform.API.DTOs;

namespace ChatPlatform.API.Middleware;

public class ExceptionMiddleware(RequestDelegate next, ILogger<ExceptionMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (AppException ex)
        {
            await WriteAsync(context, ex.Status, ex.Code, ex.Message);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Unhandled exception while processing {Method} {Path}", context.Request.Method, context.Request.Path);
            await WriteAsync(context, (int)HttpStatusCode.InternalServerError, "InternalServerError",
                "An unexpected error occurred.");
        }
    }

    private static async Task WriteAsync(HttpContext context, int status, string code, string message)
    {
        if (context.Response.HasStarted) return;
        context.Response.Clear();
        context.Response.StatusCode = status;
        context.Response.ContentType = "application/json";
        var body = JsonSerializer.Serialize(new ErrorResponse(code, message));
        await context.Response.WriteAsync(body);
    }
}
