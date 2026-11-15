import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// local.properties 의 pleauto.serverUrl 로 폰 웹 서버 주소를 바꾼다.
// 기본값 10.0.2.2:3000 은 에뮬레이터에서 본 PC의 localhost (npm run dev).
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
val serverUrl: String = localProps.getProperty("pleauto.serverUrl") ?: "http://10.0.2.2:3000"
// Pleos 콘솔 My Project의 Client ID/Secret. 넣으면 TTS·STT를 HYBRID(서버 우선)로 쓴다.
// local.properties 는 git에 올라가지 않는다. 값이 APK에 들어가므로 공개 release APK는 빼고 빌드한다.
val pleosClientId: String = localProps.getProperty("pleos.clientId").orEmpty()
val pleosClientSecret: String = localProps.getProperty("pleos.clientSecret").orEmpty()

android {
    namespace = "com.pleauto.vehicle"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.pleauto.vehicle"
        minSdk = 28 // Pleos Connect 요구사항
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "SERVER_URL", "\"$serverUrl\"")
        buildConfigField("String", "PLEOS_CLIENT_ID", "\"$pleosClientId\"")
        buildConfigField("String", "PLEOS_CLIENT_SECRET", "\"$pleosClientSecret\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // 시연용: 서명 키가 정해지기 전에는 debug 키로 release APK를 만든다
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    // 주행 중/정차 중(CarUxRestrictionsManager)
    useLibrary("android.car")
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation("ai.pleos.playground:NaviHelper:3.0.5")
    implementation("ai.pleos.playground:TextToSpeech:3.3.1")
    implementation("ai.pleos.playground:SpeechToText:3.3.1")

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
}
