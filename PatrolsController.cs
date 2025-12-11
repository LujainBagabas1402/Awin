using AwinApp2.Models;   // عدّليه حسب اسم مشروعك
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace AwinApi2.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class PatrolsController : ControllerBase
    {
        private readonly IConfiguration _config;

        public PatrolsController(IConfiguration config)
        {
            _config = config;
        }

        [HttpGet("history/{unitId}")]
        public async Task<IEnumerable<PatrolHistoryDto>> GetHistory(int unitId)
        {
            var result = new List<PatrolHistoryDto>();

            var cs = _config.GetConnectionString("AwinDb");

            using (var con = new SqlConnection(cs))
            {
                await con.OpenAsync();

                var sql = @"
            SELECT TOP 5 UnitId, Lat, Lng, DateTimeAt
            FROM HisUnits
            WHERE UnitId = @UnitId
            ORDER BY DateTimeAt DESC";

                using (var cmd = new SqlCommand(sql, con))
                {
                    cmd.Parameters.AddWithValue("@UnitId", unitId);

                    using (var reader = await cmd.ExecuteReaderAsync())
                    {
                        while (await reader.ReadAsync())
                        {
                            var dto = new PatrolHistoryDto
                            {
                                UnitId = reader.GetInt32(reader.GetOrdinal("UnitId")),
                                Lat = Convert.ToDouble(reader["Lat"]),
                                Lng = Convert.ToDouble(reader["Lng"]),
                                DateTimeAt = reader.GetDateTime(reader.GetOrdinal("DateTimeAt"))
                            };

                            result.Add(dto);
                        }
                    }
                }
            }

            return result;
        }





        [HttpGet("last")]
        public async Task<IEnumerable<PatrolDto>> GetLastLocations()
        {
            var result = new List<PatrolDto>();
            var cs = _config.GetConnectionString("AwinDb");

            using var con = new SqlConnection(cs);
            await con.OpenAsync();

            var sql = @"
                SELECT 
                    u.UnitId,
                    u.Name,
                    u.FromLat, u.ToLat, u.FromLng, u.ToLng,
                    h.Lat, h.Lng, h.Status, h.DateTimeAt
                FROM Units u
                JOIN (
                    SELECT UnitId, Lat, Lng, Status, DateTimeAt,
                           ROW_NUMBER() OVER (PARTITION BY UnitId ORDER BY DateTimeAt DESC) AS rn
                    FROM HisUnits
                ) h ON u.UnitId = h.UnitId AND h.rn = 1
            ";

            using var cmd = new SqlCommand(sql, con);
            using var reader = await cmd.ExecuteReaderAsync();

            while (await reader.ReadAsync())
            {
                var dto = new PatrolDto
                {
                    UnitId = reader.GetInt32(reader.GetOrdinal("UnitId")),
                    Name = reader.GetString(reader.GetOrdinal("Name")),
                    FromLat = Convert.ToDouble(reader.GetDecimal(reader.GetOrdinal("FromLat"))),
                    ToLat = Convert.ToDouble(reader.GetDecimal(reader.GetOrdinal("ToLat"))),
                    FromLng = Convert.ToDouble(reader.GetDecimal(reader.GetOrdinal("FromLng"))),
                    ToLng = Convert.ToDouble(reader.GetDecimal(reader.GetOrdinal("ToLng"))),
                    Lat = Convert.ToDouble(reader.GetDecimal(reader.GetOrdinal("Lat"))),
                    Lng = Convert.ToDouble(reader.GetDecimal(reader.GetOrdinal("Lng"))),
                    Status = reader.GetString(reader.GetOrdinal("Status")),
                    LastUpdate = reader.GetDateTime(reader.GetOrdinal("DateTimeAt"))
                };

                result.Add(dto);
            }

            return result;
        }
    }







}
