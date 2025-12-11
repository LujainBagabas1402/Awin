namespace AwinApp2.Models
{
    public class PatrolDto
    {
        public int UnitId { get; set; }
        public string Name { get; set; }

        public double Lat { get; set; }
        public double Lng { get; set; }
        public string Status { get; set; }

        public double FromLat { get; set; }
        public double ToLat { get; set; }
        public double FromLng { get; set; }
        public double ToLng { get; set; }
        public DateTime LastUpdate { get; set; }
    }
}
