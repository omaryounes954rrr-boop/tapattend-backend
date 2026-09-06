from math import asin, cos, radians, sin, sqrt


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * r * asin(sqrt(a))


def within_radius(
    point_lat: float | None,
    point_lon: float | None,
    user_lat: float | None,
    user_lon: float | None,
    radius_meters: int,
) -> bool:
    if point_lat is None or point_lon is None:
        return True
    if user_lat is None or user_lon is None:
        return False
    return haversine_meters(point_lat, point_lon, user_lat, user_lon) <= radius_meters
