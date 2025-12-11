using System;
using System.Collections.Generic;
using System.Data.SqlClient;
using System.Threading;

namespace AawinSimulator
{
    class UnitInfo
    {
        public int UnitId;
        public string Name;
        public double FromLat;
        public double ToLat;
        public double FromLng;
        public double ToLng;
        public string Status;
    }

    class Program
    {
        private const string ConnectionString =
            "Server=MSI\\SQLEXPRESS;Database=awin;Trusted_Connection=True;";

        static void Main(string[] args)
        {
            Console.WriteLine("Aawin Units Simulator is running...");
            Random rand = new Random();

            while (true)
            {
                try
                {
                    List<UnitInfo> units = GetUnits();

                    using (SqlConnection conn = new SqlConnection(ConnectionString))
                    {
                        conn.Open();

                        foreach (UnitInfo u in units)
                        {
                            // اخر موقع
                            double lat, lng;
                            GetLastPosition(conn, u.UnitId, u, out lat, out lng);

                            // حركة بسيطة
                            double step = 0.0004;
                            double deltaLat = (rand.NextDouble() - 0.9) * step;
                            double deltaLng = (rand.NextDouble() - 0.9) * step;

                            double newLat = lat + deltaLat;
                            double newLng = lng + deltaLng;

                            // حدود النطاق
                            if (newLat < u.FromLat || newLat > u.ToLat)
                                newLat = lat - deltaLat;

                            if (newLng < u.FromLng || newLng > u.ToLng)
                                newLng = lng - deltaLng;

                            // إدخال في الهيستوري
                            SqlCommand insertCmd = new SqlCommand(
                                "INSERT INTO HisUnits (UnitId, Lat, Lng, Status) VALUES (@UnitId, @Lat, @Lng, @Status)", conn);

                            insertCmd.Parameters.AddWithValue("@UnitId", u.UnitId);
                            insertCmd.Parameters.AddWithValue("@Lat", newLat);
                            insertCmd.Parameters.AddWithValue("@Lng", newLng);
                            insertCmd.Parameters.AddWithValue("@Status", (object)u.Status ?? DBNull.Value);

                            insertCmd.ExecuteNonQuery();

                            Console.WriteLine("Unit " + u.UnitId + " moved to (" + newLat + ", " + newLng + ")");
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine("Error: " + ex.Message);
                }

                Thread.Sleep(5000);
            }
        }

        // قراءة جدول Units
        static List<UnitInfo> GetUnits()
        {
            List<UnitInfo> result = new List<UnitInfo>();

            using (SqlConnection conn = new SqlConnection(ConnectionString))
            {
                conn.Open();
                SqlCommand cmd = new SqlCommand(
                    "SELECT UnitId, Name, FromLat, ToLat, FromLng, ToLng, Status FROM Units", conn);

                SqlDataReader reader = cmd.ExecuteReader();

                while (reader.Read())
                {
                    UnitInfo u = new UnitInfo();
                    u.UnitId = reader.GetInt32(0);
                    u.Name = reader.IsDBNull(1) ? null : reader.GetString(1);
                    u.FromLat = Convert.ToDouble(reader.GetDecimal(2));
                    u.ToLat = Convert.ToDouble(reader.GetDecimal(3));
                    u.FromLng = Convert.ToDouble(reader.GetDecimal(4));
                    u.ToLng = Convert.ToDouble(reader.GetDecimal(5));
                    u.Status = reader.IsDBNull(6) ? null : reader.GetString(6);

                    result.Add(u);
                }
            }

            return result;
        }

        // جلب اخر موقع
        static void GetLastPosition(SqlConnection conn, int unitId, UnitInfo u, out double lat, out double lng)
        {
            SqlCommand cmd = new SqlCommand(
                "SELECT TOP 1 Lat, Lng FROM HisUnits WHERE UnitId=@UnitId ORDER BY DateTimeAt DESC", conn);

            cmd.Parameters.AddWithValue("@UnitId", unitId);

            SqlDataReader r = cmd.ExecuteReader();

            if (r.Read())
            {
                lat = Convert.ToDouble(r.GetDecimal(0));
                lng = Convert.ToDouble(r.GetDecimal(1));
                r.Close();
                return;
            }

            r.Close();

            // لو ما فيه هيستوري نبدأ من منتصف النطاق
            lat = (u.FromLat + u.ToLat) / 2.0;
            lng = (u.FromLng + u.ToLng) / 2.0;
        }
    }
}
