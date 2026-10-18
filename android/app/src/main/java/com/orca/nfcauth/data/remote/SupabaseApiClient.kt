package com.orca.nfcauth.data.remote

import com.orca.nfcauth.data.model.NfcPayload
import com.orca.nfcauth.data.model.VerificationResponse
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

class SupabaseApiClient(
    private val baseUrl: String = "https://jklfqmbaubvnbrbuhzak.supabase.co/functions/v1/nfc"
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS)
        .build()

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
    }

    /**
     * Supabase Edge Function을 호출하여 NFC 태그를 검증하고 결과를 반환합니다.
     */
    suspend fun verifyTag(payload: NfcPayload): Result<VerificationResponse> = withContext(Dispatchers.IO) {
        val startTime = System.currentTimeMillis()

        try {
            val urlBuilder = baseUrl.toHttpUrlOrNull()?.newBuilder()
                ?: return@withContext Result.failure(IllegalArgumentException("잘못된 API URL입니다: $baseUrl"))

            urlBuilder.addQueryParameter("uid", payload.uid)
            urlBuilder.addQueryParameter("cnt", payload.counterHex)
            urlBuilder.addQueryParameter("mac", payload.mac)
            urlBuilder.addQueryParameter("kid", payload.kid)
            urlBuilder.addQueryParameter("format", "json")

            val request = Request.Builder()
                .url(urlBuilder.build())
                .header("Accept", "application/json")
                .get()
                .build()

            client.newCall(request).execute().use { response ->
                val latency = System.currentTimeMillis() - startTime
                val bodyString = response.body?.string() ?: ""

                if (bodyString.isBlank()) {
                    return@withContext Result.failure(Exception("서버 응답 본문이 비어있습니다. (HTTP ${response.code})"))
                }

                try {
                    val parsed = json.decodeFromString<VerificationResponse>(bodyString)
                    parsed.latencyMs = latency
                    Result.success(parsed)
                } catch (jsonErr: Exception) {
                    Result.failure(Exception("응답 파싱 오류: ${jsonErr.message}\n본문: $bodyString"))
                }
            }
        } catch (e: Exception) {
            val latency = System.currentTimeMillis() - startTime
            Result.failure(Exception("네트워크 연결 실패 (${latency}ms): ${e.localizedMessage ?: e.message}"))
        }
    }
}
