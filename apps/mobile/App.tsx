import { base64 } from '@scure/base';
import * as Random from 'expo-random';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useState } from 'react';
import { Button, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native';

import {
  base64UrlToBytes,
  bytesToBase64Url,
  createPhoenixZeroProof,
  decodeProofFromCompactString,
  ed25519KeyPairFromPrivateKey,
  encodeProofToCompactString,
  generateEd25519KeyPair,
  phoenixZeroProofId,
  verifyPhoenixZeroProof
} from '@phoenix-zero/core';

const STORAGE_PRIVATE_KEY = 'phoenix_zero_private_key_b64url';

async function pickVideoBytes(): Promise<{ bytes: Uint8Array; mimeType?: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'video/*', copyToCacheDirectory: true });
  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset?.uri) return null;

  const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  const bytes = base64.decode(b64);

  return { bytes, mimeType: asset.mimeType ?? undefined };
}

export default function App() {
  const [privateKeyB64Url, setPrivateKeyB64Url] = useState<string>('');
  const [creatorId, setCreatorId] = useState<string>('');
  const [proofCompact, setProofCompact] = useState<string>('');
  const [status, setStatus] = useState<string>('');

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(STORAGE_PRIVATE_KEY);
      if (stored) setPrivateKeyB64Url(stored);
    })();
  }, []);

  const keyPair = useMemo(() => {
    try {
      if (!privateKeyB64Url) return null;
      const bytes = base64UrlToBytes(privateKeyB64Url);
      return ed25519KeyPairFromPrivateKey(bytes);
    } catch {
      return null;
    }
  }, [privateKeyB64Url]);

  async function onGenerateKey() {
    try {
      const kp = generateEd25519KeyPair((len: number) => Random.getRandomBytes(len));
      const pk = bytesToBase64Url(kp.privateKey);
      setPrivateKeyB64Url(pk);
      await AsyncStorage.setItem(STORAGE_PRIVATE_KEY, pk);
      setStatus('Chave gerada e salva localmente.');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erro desconhecido';
      setStatus(message);
    }
  }

  async function onStamp() {
    try {
      if (!keyPair) {
        setStatus('Chave inválida. Gere uma chave primeiro.');
        return;
      }

      const picked = await pickVideoBytes();
      if (!picked) return;

      const proof = createPhoenixZeroProof({
        videoBytes: picked.bytes,
        keyPair,
        creatorId: creatorId || undefined,
        mimeType: picked.mimeType
      });

      const compact = encodeProofToCompactString(proof);
      setProofCompact(compact);
      setStatus(`Prova gerada. proofId=${phoenixZeroProofId(proof)}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erro desconhecido';
      setStatus(message);
    }
  }

  async function onVerify() {
    try {
      const picked = await pickVideoBytes();
      if (!picked) return;

      if (!proofCompact) {
        setStatus('Cole o proofCompact para verificar.');
        return;
      }

      const proof = decodeProofFromCompactString(proofCompact.trim());
      const result = verifyPhoenixZeroProof({ videoBytes: picked.bytes, proof });
      setStatus(result.ok ? '✅ Autêntico' : `❌ Falhou: ${result.reason}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erro desconhecido';
      setStatus(message);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '700' }}>Phoenix Zero (Offline-first)</Text>

        <View style={{ gap: 8 }}>
          <Text>creatorId (opcional)</Text>
          <TextInput
            value={creatorId}
            onChangeText={setCreatorId}
            placeholder="@seu_usuario"
            style={{ borderWidth: 1, padding: 10, borderRadius: 8 }}
            autoCapitalize="none"
          />
        </View>

        <View style={{ gap: 8 }}>
          <Text>privateKeyB64Url (Ed25519, 32 bytes)</Text>
          <TextInput
            value={privateKeyB64Url}
            onChangeText={setPrivateKeyB64Url}
            placeholder="(gere ou cole aqui)"
            style={{ borderWidth: 1, padding: 10, borderRadius: 8 }}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button title="Gerar nova chave" onPress={onGenerateKey} />
        </View>

        <View style={{ gap: 8 }}>
          <Button title="Selecionar vídeo e gerar prova" onPress={onStamp} />
          <Text>proofCompact</Text>
          <TextInput
            value={proofCompact}
            onChangeText={setProofCompact}
            placeholder="(será preenchido após gerar)"
            style={{ borderWidth: 1, padding: 10, borderRadius: 8, minHeight: 120 }}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button title="Selecionar vídeo e verificar proofCompact" onPress={onVerify} />
        </View>

        <View style={{ gap: 6 }}>
          <Text>Status</Text>
          <Text selectable style={{ fontFamily: 'monospace' }}>
            {status}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
