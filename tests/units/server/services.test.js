import { jest, expect, describe, test, beforeEach } from "@jest/globals";
import fs from "fs";
import fsPromises from "fs/promises";
import { join } from "path";
import { PassThrough, Writable } from "stream";
import StreamPromises from "stream/promises";
import childProcess from "child_process";
import { Service } from "../../../server/service.js";
import TestUtil from "../_util/testUtil.js";
import config from "../../../server/config.js";

describe("#Services", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  const service = new Service();
  const uuidLength = 36;

  test("should return an object containing a stream and type", async () => {
    const filename = "/index.html";

    const mockReadableStream = TestUtil.generateReadableStream([
      "<h1>Hello</h1>",
    ]);
    const expectedType = ".html";

    jest
      .spyOn(Service.prototype, Service.prototype.getFileInfo.name)
      .mockResolvedValue({
        type: expectedType,
        name: filename,
      });

    jest
      .spyOn(Service.prototype, Service.prototype.createFileStream.name)
      .mockReturnValue(mockReadableStream);

    const result = await service.getFileStream(filename);

    expect(Service.prototype.createFileStream).toHaveBeenCalledWith(filename);
    expect(result).toEqual({
      stream: mockReadableStream,
      type: expectedType,
    });
  });

  test("should return an object containing a name and type", async () => {
    const filename = "/index.html";
    const expectedfullFilePath = join(config.dir.publicDirectory, filename);
    const expectedResult = {
      type: ".html",
      name: expectedfullFilePath,
    };

    jest.spyOn(fsPromises, fsPromises.access.name).mockResolvedValue();
    const result = await service.getFileInfo(filename);

    expect(fsPromises.access).toHaveBeenCalledWith(expectedfullFilePath);
    expect(result).toEqual(expectedResult);
  });

  test("should return a fileStream", async () => {
    const filename = "help-ukraine.html";

    const mockReadableStream = TestUtil.generateReadableStream([
      "<h1>Help</h1>",
    ]);

    jest
      .spyOn(fs, fs.createReadStream.name)
      .mockReturnValue(mockReadableStream);

    const result = await service.createFileStream(filename);

    expect(fs.createReadStream).toHaveBeenCalledWith(filename);
    expect(result).toEqual(mockReadableStream);
  });

  test("it should create clientStream", async () => {
    const clientStreams = jest.spyOn(
      service.clientStreams,
      service.clientStreams.set.name
    );

    const result = service.createClientStream();

    expect(clientStreams).toHaveBeenCalled();
    expect(result.id.length).toBe(uuidLength);
    expect(result.clientStream).toBeInstanceOf(PassThrough);
  });

  test("it should remove clientStream", async () => {
    const id = "asl2nsx6hbfg29djmnas";

    const clientStreams = jest.spyOn(
      service.clientStreams,
      service.clientStreams.delete.name
    );

    service.removeClientStream(id);

    expect(clientStreams).toHaveBeenCalledWith(id);
  });

  test("it should execute sox", async () => {
    const args = ["tutistutis.mp3"];

    const spawn = jest.spyOn(childProcess, childProcess.spawn.name);

    service._executeSoxCommand(args);

    expect(spawn).toHaveBeenCalledWith("sox", args);
  });

  test("it should return bitrate of song", async () => {
    const song = "music.mp3";
    const bitRate = ["128k", "128000"];
    const args = ["--i", "-B", song];

    const stderr = TestUtil.generateReadableStream("");
    const stdout = TestUtil.generateReadableStream([bitRate[0]]);

    const execCommand = jest
      .spyOn(service, service._executeSoxCommand.name)
      .mockReturnValue({ stderr, stdout });

    const result = await service.getBitRate(song);

    expect(execCommand).toHaveBeenCalledWith(args); 
    expect(result).toBe(bitRate[1]);
  });

  test("it should broadcast tranfer streams with clients", async () => {
    const data = "tutis tutis";
    const uuid = "acywmcls92nfd7";

    const mockReadableStream = TestUtil.generateReadableStream([data]);
    const mockWritableStream = TestUtil.generateWritableStream((chunk) => {
      expect(chunk.toString()).toBe(data);
    });

    service.clientStreams.set(uuid, mockWritableStream);

    const broadCast = service.broadCast();

    await StreamPromises.pipeline(mockReadableStream, broadCast);

    expect(broadCast).toBeInstanceOf(Writable);
  });

  test("it should remove client on endend stream", async () => {
    const data = "tutis tutis";
    const uuid = "acywmcls92nfd7";

    const mockReadableStream = TestUtil.generateReadableStream([data]);
    const mockWritableStream = TestUtil.generateWritableStream();
    const removeClientStream = jest.spyOn(
      service,
      service.removeClientStream.name
    );

    service.clientStreams.set(uuid, mockWritableStream);
    mockWritableStream.end();

    const broadCast = service.broadCast();

    await StreamPromises.pipeline(mockReadableStream, broadCast);

    expect(broadCast).toBeInstanceOf(Writable);
    expect(removeClientStream).toBeCalledWith(uuid);
  });

  test("it should start streaming", async () => {
    const bitRate = "128000";
    const mockReadableStream = TestUtil.generateReadableStream(["data"]);

    jest.spyOn(service, service.getBitRate.name).mockResolvedValue(bitRate);
    jest
      .spyOn(service, service.createFileStream.name)
      .mockReturnValue(mockReadableStream);

    const pipeline = await service.startStreamming();
  });

  test("it should stop streaming", async () => {
    const end = jest.fn();
    service.throttleTransform = { end };

    await service.stopStreamming()

    expect(end).toHaveBeenCalled()
  });

  describe("Exceptions", () => {
    test("should return an error if file does not exis", async () => {
      const filename = "/zaaum.html";

      jest
        .spyOn(Service.prototype, Service.prototype.getFileInfo.name)
        .mockRejectedValue(new Error("Error: ENOENT"));

      await expect(service.getFileStream(filename)).rejects.toThrow();
      expect(Service.prototype.getFileInfo).toHaveBeenCalledWith(filename);
    });

    test("should return an error if file does not exis", async () => {
      const filename = "/zaaum.html";
      const expectedfullFilePath = join(config.dir.publicDirectory, filename);

      jest
        .spyOn(fsPromises, fsPromises.access.name)
        .mockRejectedValue(new Error("ENOENT"));

      await expect(service.getFileInfo(filename)).rejects.toThrow();
      expect(fsPromises.access).toHaveBeenCalledWith(expectedfullFilePath);
    });

    test("it should error in getBitRate", async () => {
      const song = "music.mp3";
      const args = ["--i", "-B", song];

      const stderr = TestUtil.generateReadableStream(["error"]);
      const stdout = TestUtil.generateReadableStream("");
  
      const execCommand = jest
        .spyOn(service, service._executeSoxCommand.name)
        .mockReturnValue({ stderr, stdout });
  
      const result = await service.getBitRate(song);
  
      expect(execCommand).toHaveBeenCalledWith(args);
      expect(result).toBe(config.constants.fallbackBitRate);
    })
  });
});
