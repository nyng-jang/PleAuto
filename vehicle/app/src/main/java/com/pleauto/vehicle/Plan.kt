package com.pleauto.vehicle

import org.json.JSONObject

/** GET /api/vehicle/plan 응답 */
data class Plan(val title: String, val updatedAt: Long, val days: List<Day>) {
    companion object {
        fun fromJson(o: JSONObject): Plan {
            val days = o.optJSONArray("days")
            return Plan(
                title = o.optString("title"),
                updatedAt = o.optLong("updatedAt"),
                days = List(days?.length() ?: 0) { Day.fromJson(days!!.getJSONObject(it)) },
            )
        }
    }
}

data class Day(val dayIndex: Int, val date: String, val stops: List<Stop>) {
    companion object {
        fun fromJson(o: JSONObject): Day {
            val stops = o.optJSONArray("stops")
            return Day(
                dayIndex = o.optInt("dayIndex"),
                date = o.optString("date"),
                stops = List(stops?.length() ?: 0) { Stop.fromJson(stops!!.getJSONObject(it)) },
            )
        }
    }
}

enum class PlaceStatus { CONFIRMED, UNRESOLVED, EXCLUDED }

data class Place(val name: String, val address: String, val lat: Double, val lng: Double)

data class Stop(
    val id: String,
    val order: Int,
    val name: String,
    val time: String,
    val memo: String,
    val status: PlaceStatus,
    val place: Place?,
) {
    companion object {
        fun fromJson(o: JSONObject): Stop {
            val p = o.optJSONObject("place")
            return Stop(
                id = o.optString("id"),
                order = o.optInt("order"),
                name = o.optString("name"),
                time = o.optString("time"),
                memo = o.optString("memo"),
                status = when (o.optString("placeStatus")) {
                    "confirmed" -> PlaceStatus.CONFIRMED
                    "excluded" -> PlaceStatus.EXCLUDED
                    else -> PlaceStatus.UNRESOLVED
                },
                place = p?.let { Place(it.optString("name"), it.optString("address"), it.optDouble("lat"), it.optDouble("lng")) },
            )
        }
    }
}
