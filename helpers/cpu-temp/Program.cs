using LibreHardwareMonitor.Hardware;
using System.Diagnostics;
using System.Text.Json;

if (args.Length < 2)
{
    return 1;
}

var outPath = args[0];
var parentPid = int.Parse(args[1]);

var dir = System.IO.Path.GetDirectoryName(outPath);
if (!string.IsNullOrEmpty(dir))
{
    Directory.CreateDirectory(dir);
}

var computer = new Computer { IsCpuEnabled = true };
computer.Open();

try
{
    while (true)
    {
        try
        {
            if (Process.GetProcessById(parentPid).HasExited)
            {
                break;
            }
        }
        catch
        {
            break;
        }

        var temps = new List<object>();
        foreach (var hw in computer.Hardware.Where(h => h.HardwareType == HardwareType.Cpu))
        {
            hw.Update();
            foreach (var s in hw.Sensors)
            {
                if (s.SensorType == SensorType.Temperature && s.Value.HasValue)
                {
                    temps.Add(new { name = s.Name, value = Math.Round(s.Value.Value, 1) });
                }
            }
        }

        var payload = new { ts = DateTimeOffset.UtcNow.ToUnixTimeSeconds(), temps };
        var json = JsonSerializer.Serialize(payload);
        System.IO.File.WriteAllText(outPath + ".tmp", json);
        System.IO.File.Move(outPath + ".tmp", outPath, true);

        System.Threading.Thread.Sleep(2000);
    }
}
finally
{
    computer.Close();
}

return 0;
