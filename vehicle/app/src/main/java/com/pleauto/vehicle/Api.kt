package com.pleauto.vehicle

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** 폰 웹 서버(web/src/app/api/vehicle/*)와 통신한다. */
class Api(private val baseUrl: String = BuildConfig.SERVER_URL) {

    class ApiException(message: String, val status: Int) : Exception(message)

    sealed interface PairStatus {
        data object Pending : PairStatus
        data object Rejected : PairStatus
        data class Approved(val token: String) : PairStatus
    }

    /** 6자리 코드로 연결 요청 → requestId */
    suspend fun requestPair(code: String, vehicleName: String): String {
        val body = JSONObject().put("code", code).put("vehicleName", vehicleName)
        return call("POST", "/api/vehicle/pair", body = body).getString("requestId")
    }

    suspend fun pairStatus(requestId: String): PairStatus {
        val r = call("GET", "/api/vehicle/pair/$requestId")
        return when (r.optString("status")) {
            "approved" -> PairStatus.Approved(r.getString("vehicleToken"))
            "rejected" -> PairStatus.Rejected
            else -> PairStatus.Pending
        }
    }

    suspend fun plan(token: String): Plan = Plan.fromJson(call("GET", "/api/vehicle/plan", token = token))

    suspend fun disconnect(token: String) {
        call("DELETE", "/api/vehicle/connection", token = token)
    }

    private suspend fun call(method: String, path: String, body: JSONObject? = null, token: String? = null): JSONObject =
        withContext(Dispatchers.IO) {
            val conn = (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = 8000
                readTimeout = 8000
                setRequestProperty("Accept", "application/json")
                if (token != null) setRequestProperty("Authorization", "Bearer $token")
                if (body != null) {
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                }
            }
            try {
                if (body != null) conn.outputStream.use { it.write(body.toString().toByteArray()) }
                val status = conn.responseCode
                val stream = if (status in 200..299) conn.inputStream else conn.errorStream
                val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
                val json = if (text.isBlank()) JSONObject() else JSONObject(text)
                if (status !in 200..299) {
                    throw ApiException(json.optString("error", "서버 오류 ($status)"), status)
                }
                json
            } finally {
                conn.disconnect()
            }
        }
}
