plugins {
    id("com.android.application")
}

android {
    namespace = "org.strativis.app"
    compileSdk = 36

    defaultConfig {
        // Package name registered in Google Play Console (permanent)
        applicationId = "sedimentary.logs"
        minSdk = 24
        targetSdk = 36
        // Raise versionCode by 1 for every upload to Google Play.
        versionCode = 34
        versionName = "1.8.0"
    }

    buildFeatures {
        buildConfig = true
    }

    // play: the Google Play build (no external donation link).
    // direct: the APK you share yourself (with the PayPal donation button).
    flavorDimensions += "store"
    productFlavors {
        create("play") {
            dimension = "store"
            buildConfigField("boolean", "DONATIONS", "false")
        }
        create("direct") {
            dimension = "store"
            buildConfigField("boolean", "DONATIONS", "true")
            // the APK you share yourself keeps its original package name
            applicationId = "org.strativis.app"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
